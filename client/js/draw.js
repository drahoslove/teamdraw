var draw = new(function Draw(){

	// const SPACE = " "; //  space;
	// const LINE =  "_"; // low line

	const SPACE = "\u2002"; // en space
	const LINE =  "\u23bd"; // Horizontal Scan Line-9

	// const SPACE = "\u200d"; // zero space;
	// const LINE =  "\u0332"; // combining low line

	var console = new Logger("draw");

	var _currentToolName = '';

	var _color;
	var _size;

	var _tools = {};

	var _textItem;

	var cursorManager;

	/* init */
	$(function(){
		paper.setup("canvas");
		paper.settings.hitTolerance = 3;
		paper.view.scrollBy([-paper.view.center.x, -paper.view.center.y]); // center first
		paper.view.onResize = function(event){
			paper.view.scrollBy([-event.delta.width/2, - event.delta.height/2]);
		};

		var background = new paper.Shape.Rectangle({
			rectangle: paper.view.bounds,
			fillColor: {hue: 0, saturation: 0, lightness: 0.96},
		});
		background.onFrame = function() {
			this.bounds = paper.view.bounds;
		};

		_textItem = new paper.PointText({
			// fontFamily: 'Consolas, monospace',
			fontSize: 20,
			content: SPACE,
			visible: false,
		});
		_textItem.onFrame = blinkCursor;

		draw.setColor('#333');
		draw.setSize(2);

		cursorManager = new CursorManager(paper.project);

		app.on("logged on", function() {
			paper.project.view.on('mousemove', function(event) {
				app.postCursorPosition(toPlainObject(event.point));
			});
		});

		app.on("userlist update", function(users) {
			users.forEach(function(user) {
				if (app.getNick() !== user.nick && !cursorManager.exists(user.nick)) {
					cursorManager.new(user.nick, user.color);
				}
			});
		});

		app.on("cursors update", function(cursors) {
			cursors.forEach(function(cursor) {
				if (app.getNick() !== cursor.name) {
					cursorManager.moveCursorTo(cursor.name, cursor.position, 125);
				}
			});
		});

		app.on("action update", function(action) {
			if (action.type === "item") {
				var json = action.data;
				var n = action.n;
				var className = json[0];
				if (!(className in paper)) {
					console.error("unknown item type", className);
					return;
				}
				var item = new paper[className];
				item.importJSON(json);
				item.n = n; // for deleting and manipulation purposes

				item.onDoubleClick = function () {
					if (_currentToolName == "selector") {
						paper.project.deselectAll();
						this.selected = true;
						switch(this.className) {
							case "Path":
								draw.changeToolTo("pathEdit");
								break;
							case "PointText":
								draw.changeToolTo("textEdit");
								break;
						}
					}
				}
			}
			if (action.type === "textEdit") {
				var n = action.data.n;
				var text = action.data.text;

				var item = paper.project.getItem(filterByNs([n]));

				if (!item) {
					console.error("no items with n=%d to edit", n);
					return;
				}

				if (text === "") {
					item.remove();
				}

				item.content = text;
			}
			if (action.type === "erase") {
				var ns = action.data;
				var items = paper.project.getItems(filterByNs(ns));
				if (items.length === 0) {
					console.error("no items with ns=%s to erase", String(ns));
					return;
				}
				items.forEach(function(item) {
					item.remove();
				});
			}
			if (action.type === "translate") {
				var ns = action.data.ns;
				var delta = action.data.delta;
				paper.project.getItems(filterByNs(ns)).forEach(function(item) {
					item.translate(delta);
				});
			}
			if (action.type === "color") {
				var ns = action.data.ns;
				var color = action.data.color;
				paper.project.getItems(filterByNs(ns)).forEach(function(item) {
					if (item.hasFill()) {
						item.fillColor = color;
					} else {
						item.strokeColor = color;
					}
				});
			}
		});

	});

	function blinkCursor(event) {
		if (event.count % 25 === 0) {
			this.content = this.content.replace(new RegExp("("+LINE+"|"+SPACE+")$"), function(match) {
				return match === LINE ? SPACE : LINE;
			});
		}
	}

	function eraseItems(items) {
		items = items.filter(function (item) { // only delete visible
			return item.visible;
		});
		if (items.length === 0) {
			return; // nothing to delete
		}
		items.forEach(function (item) { // to prevent multiple deletions
			item.visible = false;
		});
		var itemNumbers = items.map(function (item) {return item.n});
		app.postAction("erase", itemNumbers, function (err) {
			if (err) {
				items.forEach(function (item) {
					item.visible = true;
				});
			}
		});
	}

	function cloneSelected() {
		paper.project.selectedItems.forEach(function (item) {
			var clone = item.clone();
			clone.selected = false;
			app.postAction("item", clone.exportJSON({asString:false}), function () {
				clone.remove(); // will be replaced with update from server
			});
		});
	}

	function filterByNs(wantedN) {
		return {
			n: function(providedN){
				if(wantedN instanceof Array){
					return wantedN.some(function(wantedN){
						return providedN === wantedN;
					});
				}
			}
		}
	}

	var withN = {
		n: function(n){
			return n !== undefined;
		},
	};

	function getItemsNearPoint (point) {
		var radius = 4 / paper.view.getZoom();
		return paper.project.getItems(withN).filter(function(item) {
			if (item instanceof paper.Path) {
				if (item.isClosed() && item.hasFill()) {
					if (item.contains(point)) {
						return true;
					}
				}
				var nearestPoint = item.getNearestPoint(point);
				if (nearestPoint) {
					return nearestPoint.isClose(point, radius);
				}
			}
			if (item instanceof paper.PointText) {
				return item.bounds.contains(point);
			}
			return false;
		});
	};

	function getItemsNearEvent (event) {
		var trackingPath = new paper.Path({
			segments: [event.lastPoint, event.point],
			visible: false,
		});
		setTimeout(function() {
			trackingPath.remove();
		});

		return _.uniq(paper.project.getItems(withN).filter(function(item) {
			return trackingPath.intersects(item);
		}).concat(getItemsNearPoint(event.point)));
	};

	/**
	 * convert paper object to plain object, so it could be JSONized in more common way
	 * eg.: {"x": 5, "y": 6} isntead of ["Point", 5, 6]
	 */
	function toPlainObject (paperObj) {
		if(paperObj.className === "Point") {
			return {x: paperObj.x, y: paperObj.y};
		}
		return paperObj;
	}

	/**
	 * return end point aligned to multiple of angle relative to start
	 * @param  {Point} start  first point of vector
	 * @param  {Point} end    point of vector, this will be aligned
	 * @param  {number} angle [description]
	 * @param  {number} offset angle default 0
	 * @return {Point}       aligned end point relative to start
	 */
	function alignToAngle(start, end, angle, offset) {
		offset = offset || 0;
		var vector = end.subtract(start);
		var vangle = (vector.angle + 360) % 360;
		var deviation = vangle % angle;
		if (deviation >= angle/2 + offset) {
			deviation = deviation-angle;
		}
		return end.rotate(-deviation+offset, start);
	}


	_tools["none"] = new paper.Tool();

	/**
	 * tools behavior definitions
	 */

	_tools["selector"] = (function(){
		var selector = new paper.Tool();
		var path;
		var willTranslate = false;
		var translationDelta = new paper.Point();

		selector.onMouseDown = function(event) {
			translationDelta = new paper.Point();

			if (getItemsNearPoint(event.point).some(function(item) { // clicked at selected item
				return item.selected === true;
			}) && !event.modifiers.control) {
				willTranslate = true;
			}

			if (!willTranslate) { // selecting
				if (!event.modifiers.control) {
					paper.project.deselectAll();
				}
				getItemsNearPoint(event.point).forEach(function(item) {
					item.selected = !item.selected;
				});
			} else if (event.modifiers.alt) {
				cloneSelected();
			}

		}

		selector.onMouseDrag = function(event) {
			if (!willTranslate) { // selecting
				getItemsNearEvent(event).forEach(function(item) {
					item.selected = true;
				});
			} else { // shifting
				translationDelta = translationDelta.add(event.delta);
				paper.project.selectedItems.forEach(function(item) {
					item.translate(event.delta);
				});
			}
		};

		selector.onMouseUp = function(event) {
			willTranslate = false;
			if (!translationDelta.isZero()) {
				var translatinItems = paper.project.selectedItems
				var itemNumbers = translatinItems.map(function(item) {
					item.visible = false;
					return item.n;
				});

				app.postAction('translate', {
					ns: itemNumbers,
					delta: toPlainObject(translationDelta),
				}, function(err) {
					translatinItems.forEach(function(item) {
						item.translate(translationDelta.multiply(-1));
						item.visible = true;
					});
				});
			}
		}

		selector.onKeyDown = function (event) {
			if (event.key === "enter") {
				var item = paper.project.selectedItems[0];
				if (!item) {
					return;
				}
				paper.project.deselectAll();
				item.selected = true;
				if (item.className === "Path") {
					draw.changeToolTo("pathEdit");
				}
				if (item.className === "PointText") {
					draw.changeToolTo("textEdit");
				}
			}
		}

		return selector;
	})();

	_tools["pencil"] = (function(){
		var pencil = new paper.Tool();
		pencil.minDistance = 1;
		// pencil.maxDistance = 5;
		var path;
		pencil.onMouseDown = function(event){
			path = new paper.Path({
				strokeCap: 'round',
				strokeJoin: 'round',
				strokeColor: _color,
				strokeWidth: _size,
			});
			path.add(event.point);
		};
		pencil.onMouseDrag = function(event){
			if (!path) {
				return;
			}
			path.add(event.point);
		};
		pencil.onMouseUp = function(event){
			if (!path) {
				return;
			}
			if(path.segments.length === 1) { // is dot
				var point = path.segments[0].point;
				var circle = new paper.Path.Circle(point, path.strokeWidth/4);
				circle.strokeColor = path.strokeColor;
				circle.strokeWidth = path.strokeWidth/2;
				path.remove();
				path = circle;
			} else {
				path.simplify(1.2/Math.pow(paper.view.zoom, 1.5));
			}
			var cachedPath = path;
			app.postAction("item", path.exportJSON({asString:false}), function() {
				cachedPath.remove(); // will be replaced with update from server
			});
		};
		pencil.abort = function() {
			if (path) {
				path.remove();
			}
			path = undefined;
		};
		return pencil;
	})();

	_tools["brush"] = (function(){
		var brush = new paper.Tool();
		var lastDeltas = [];
		var startPoint;
		var path;
		brush.onMouseDown = function(event){
			lastDeltas = [];
			brush.minDistance = _size;
			brush.maxDistance = _size*4;
			path = new paper.Path({
				strokeCap: 'round',
				strokeJoin: 'round',
				fillColor: _color,
				strokeWidth: _size,
			});
			startPoint = event.point
			var toSide = paper.Point.random().normalize(_size);
			path.add(startPoint.subtract(toSide));
			path.add(startPoint.add(toSide.rotate(+90)));
			path.add(startPoint.add(toSide));
			path.add(startPoint.add(toSide.rotate(-90)));
			path.closePath();
			path.smooth({type: "catmull-rom"});
		};
		brush.onMouseDrag = function(event){
			if (event.count === 0) {
				path.removeSegments(0);
				path.add(startPoint);
			} else {
				path.removeSegment(path.segments.length-1);
			}
			var delta = event.delta;
			lastDeltas.push(delta);
			if (lastDeltas.length > 17) {
				lastDeltas.shift();
			}
			var averageRadius = lastDeltas.reduce(function (sum, delta) {
				return sum + delta.length;
			}, 0) / lastDeltas.length;
			var toSide = delta.normalize(averageRadius);
			path.add(event.point.add(toSide.rotate(90)));
			path.insert(0, event.point.add(toSide.rotate(-90)));
			path.add(event.point.add(toSide));
			path.closePath();
			path.smooth({type: "catmull-rom"});
		};
		brush.onMouseUp = function(event){
			if (!path) {
				return;
			}
			if (path.segments.length > 4) {
				path.simplify(1.5/Math.pow(paper.view.zoom, 0.8));
			}
			var cachedPath = path;
			app.postAction("item", path.exportJSON({asString:false}), function () {
				cachedPath.remove(); // will be replaced with update from server

			});
		};
		brush.abort = function() {
			lastDeltas = [];
			if (path) {
				path.remove();
			}
			path = undefined;
		};
		return brush;
	})();

	_tools["line"] = (function(){
		var line = new paper.Tool();
		var path;
		var from;
		line.onMouseDown = function(event){
			path = new paper.Path({
				strokeCap: 'round',
				strokeJoin: 'round',
				strokeColor: _color,
				strokeWidth: _size,
			});
			from = event.point;
			path.add(from);
			path.add(from);
		};
		line.onMouseDrag = function(event){
			path.removeSegment(1);
			if (event.modifiers.shift) { // only multiples of 15 degree
				path.add(alignToAngle(from, event.point, 15));
			} else {
				path.add(event.point);
			}
		};
		line.onMouseUp = function(event){
			if (!path) {
				return;
			}
			var cachedPath = path;
			app.postAction("item", path.exportJSON({asString:false}), function() {
				cachedPath.remove(); // will be replaced with update from server
			});
		};
		line.abort = function() {
			if (path) {
				path.remove();
			}
			path = undefined;
		};
		return line;
	})();

	_tools["arrow"] = (function(){
		var arrow = new paper.Tool();
		var path;
		var from;
		arrow.onMouseDown = function(event){
			path = new paper.Path({
				strokeCap: 'round',
				strokeJoin: 'round',
				strokeColor: _color,
				strokeWidth: _size,
			});
			from = event.point;
			path.add(from);
			path.add(from);
		};
		arrow.onMouseDrag = function(event){
			path.removeSegments(1); // all except first
			var to = event.point;
			if (event.modifiers.shift) { // only multiples of 15 degree
				to = alignToAngle(from, to, 15);
			}
			var back = to.subtract(from).normalize().multiply(18);
			path.add(to.subtract(back.multiply(0.8)));
			path.add(to.subtract(back.rotate(+15)));
			path.add(to);
			path.add(to.subtract(back.rotate(-15)));
			path.add(to.subtract(back.multiply(0.8)));

		};
		arrow.onMouseUp = function(event){
			if (!path) {
				return;
			}
			var cachedPath = path;
			app.postAction("item", path.exportJSON({asString:false}), function() {
				cachedPath.remove(); // will be replaced with update from server

			});
		};
		arrow.abort = function() {
			if (path) {
				path.remove();
			}
			path = undefined;
		};
		return arrow;
	})();

	_tools["rectangle"] = (function(){
		var rectangle = new paper.Tool();
		var path;
		var from;
		rectangle.onMouseDown = function(event){
			from = event.point;
			path = new paper.Path.Rectangle({
				from: from,
				to: from,
				strokeCap: 'round',
				strokeJoin: 'round',
				strokeColor: _color,
				strokeWidth: _size,
			});
		};
		rectangle.onMouseDrag = function(event){
			var to = event.point;
			path.removeSegments(1); // all except first
			if (event.modifiers.shift) {
				to = alignToAngle(from, to, 90, 45);
			};
			path.addSegments([
				{x: to.x, y: from.y},
				to,
				{x: from.x, y: to.y},
			]);
		}
		rectangle.onMouseUp = function(event){
			if (!path) {
				return;
			}
			var cachedPath = path;
			app.postAction("item", path.exportJSON({asString:false}), function() {
				cachedPath.remove(); // will be replaced with update from server

			});
		};
		rectangle.abort = function() {
			if (path) {
				path.remove();
			}
			path = undefined;
		};
		return rectangle;
	})();

	_tools["oval"] = (function(){
		var oval = new paper.Tool();
		var path;
		var from;
		oval.onMouseDown = function(event){
			from = event.point;
			path = new paper.Path.Ellipse({
				point: from,
				size: from.subtract(from),
				strokeCap: 'round',
				strokeJoin: 'round',
				strokeColor: _color,
				strokeWidth: _size,
			});
		};
		oval.onMouseDrag = function(event){
			var to = event.point;
			path.remove();
			if (event.modifiers.shift) {
				to = alignToAngle(from, to, 90, 45);
			};
			path = new paper.Path.Ellipse({
				point: from,
				size: to.subtract(from),
				strokeCap: 'round',
				strokeJoin: 'round',
				strokeColor: _color,
				strokeWidth: _size,
			});
		}
		oval.onMouseUp = function(event){
			if (!path) {
				return;
			}
			var cachedPath = path;
			app.postAction("item", path.exportJSON({asString:false}), function() {
				cachedPath.remove(); // will be replaced with update from server

			});
		};
		oval.abort = function() {
			if (path) {
				path.remove();
			}
			path = undefined;
		};
		return oval;
	})();

	_tools["heart"] = (function(){
		var heart = new paper.Tool();
		var path;
		var from;

		heart.onMouseDown = function(event) {
			from = event.point;
			path = new paper.Path({
				strokeCap: 'round',
				strokeJoin: 'round',
				strokeColor: _color,
				strokeWidth: _size,
			});
		};
		heart.onMouseDrag = function(event){
			var to = event.point;
			if (event.modifiers.shift) {
				to = alignToAngle(from, to, 90, 45);
			};
			var fromToVec = to.subtract(from);
			var w = fromToVec.x/2; // half width
			var h = -fromToVec.y; // height

			path.removeSegments(0); // all

			path.addSegment([0, 0]);
			path.cubicCurveTo([0, h/4], [-w, h/2], [-w, h*3/4]);
			path.cubicCurveTo([-w, h*1.1], [0, h*1.1], [0, h*3/4]);
			path.cubicCurveTo([0, h*1.1], [+w, h*1.1], [+w, h*3/4]);
			path.cubicCurveTo([+w, h/2], [0, h/4], [0, 0]);

			path.translate(from.add(fromToVec.divide(2)));
			path.translate([0, -h/2]);
		};
		heart.onMouseUp = function(event){
			if (!path) {
				return;
			}
			var cachedPath = path;
			app.postAction("item", path.exportJSON({asString:false}), function() {
				cachedPath.remove(); // will be replaced with update from server
			});
		};
		heart.abort = function() {
			if (path) {
				path.remove();
			}
			path = undefined;
		};
		return heart;
	})();


	_tools["text"] = (function(){
		var text = new paper.Tool();

		text.onKeyDown = function(event){
			_textItem.content = _textItem.content.slice(0, -1);
			if (event.key === 'backspace') {
				event.preventDefault();
				_textItem.content = _textItem.content.slice(0, -1);
			} else {
				_textItem.content += event.character;
			}
			_textItem.content += SPACE;
		};

		text.onMouseMove = function(event){
			_textItem.point = event.point.add([10, -10]);
		};

		text.onMouseUp = function(event){
			if (event.event.which !== Button.LEFT) {
				return;
			}
			if (_textItem.content.length === 1) {
				return;
			}
			_textItem.content = _textItem.content.slice(0, -1);
			app.postAction("item", _textItem.exportJSON({asString:false}), function(err) {
				if (err) {
					_textItem.content += SPACE;
				} else {
					_textItem.content = SPACE;
				}
			});
		};
		text.abort = function() {
		};
		return text;
	})();

	_tools["textEdit"] = (function() {
		var textTool = new paper.Tool();

		var textItem;

		textTool.onKeyDown = function(event) {
			textItem.content = textItem.content.slice(0, -1);
			if (event.key === 'backspace') {
				event.preventDefault();
				textItem.content = textItem.content.slice(0, -1);
			} else {
				textItem.content += event.character;
			}
			textItem.content += SPACE;
		};

		textTool.onMouseUp = function(event) {
			draw.changeToolTo("selector");

			if (textItem.oldText === textItem.content) {
				return; // No Edit
			}
			app.postAction("textEdit", {
				n: textItem.n,
				text: textItem.content
			}, function(err) {
				if (err) {
					textItem.content = textItem.oldText;
				}
			})
		}

		textTool.init = function() {
			textItem = paper.project.selectedItems[0];
			textItem.oldText = textItem.content;
			textItem.content += SPACE;
			textItem.onFrame = blinkCursor;
		}

		textTool.abort = function() {
			textItem.content = textItem.content.slice(0, -1);
			textItem.onFrame = null;
		};

		return textTool;
	})();


	_tools["pathEdit"] = (function() {
		var pathEditTool = new paper.Tool();

		var item;
		var segment;

		pathEditTool.onKeyDown = function(event) {

		};
		pathEditTool.onMouseDown = function(event) {
			var hitResult = item.hitTest(event.point, {
				segments: true,
				tolerance: 3,
			});
			if (hitResult) {
				if (hitResult.type === "segment") {
					segment = hitResult.segment;
					segment.selected = true;
				}
			}
		}

		pathEditTool.onMouseDrag = function(event) {
			if (segment) {
				segment.point = segment.point.add(event.delta);
			}
		};

		pathEditTool.onMouseUp = function(event) {
			if (segment) {
				segment.selected = false;
				segment = undefined;
			}
			if (!item || !item.hitTest(event.point, {
				segments: true,
				stroke: true,
				fill: true,
				tolerance: 20,
			})) {
				draw.changeToolTo("selector");
			}
		}

		pathEditTool.init = function() {
			item = paper.project.selectedItems[0];
			if(!item) {
				draw.changeToolTo("selector");
			} else {
				paper.settings.handleSize = 8;
			}
		}

		pathEditTool.abort = function() {
			paper.settings.handleSize = 4;
			segment = undefined;
		};

		return pathEditTool;
	})();

	_tools["eyedropper"] = (function(){
		var eyedropper = new paper.Tool();

		eyedropper.onMouseDown = function(event){
			getItemsNearPoint(event.point).some(function(item){
				var color = item.strokeColor || item.fillColor;
				draw.setColor(color.toCSS());
				return true;
			});
		};

		eyedropper.onMouseMove = function(event){ // hover
			paper.project.deselectAll();
			getItemsNearPoint(event.point).some(function(item){
				return item.selected = true;
			});
		};
		return eyedropper;
	})();

	_tools['bucket'] = (function() {
		var bucket = new paper.Tool();

		bucket.onMouseMove = function(event){ // hover
			paper.project.deselectAll();
			getItemsNearPoint(event.point).some(function(item) {
				return item.selected = true;
			});
		};

		bucket.onMouseDown = function(event){
			var ns = [];
			var oldColors = {};
			getItemsNearPoint(event.point).some(function(item) {
				if (item.hasFill()) {
					oldColors[item.n] = item.fillColor;
					item.fillColor = _color;
				} else {
					oldColors[item.n] = item.strokeColor;
					item.strokeColor = _color;
				}
				ns.push(item.n);
				return true;
			});
			if (ns.length !== 0) {
				app.postAction("color", {
					ns: ns,
					color: _color,
				}, function(err) {
					if (err) {
						paper.project.getItems(filterByNs(ns)).forEach(function (item) {
							if (item.hasFill()) {
								item.fillColor = oldColors[item.n];
							} else {
								item.strokeColor = oldColors[item.n];
							}
						});
					}
				});
			}

		};

		return bucket;
	})();

	_tools["eraser"] = (function(){
		var eraser = new paper.Tool();
		var path;

		eraser.onMouseDown = function(event) {
			eraseItems(getItemsNearPoint(event.point));
		};
		eraser.onMouseDrag = function(event) {
			eraseItems(getItemsNearEvent(event));
		};
		eraser.onMouseMove = function(event){ // hover

			paper.project.deselectAll();
			getItemsNearEvent(event).forEach(function(item) {
				item.selected = true;
			});

		}
		return eraser;
	})();

	_tools["move"] = (function(){
		var move = new paper.Tool();
		var dontDrag = false;
		var delta = {
			x: 0,
			y: 0,
		};
		move.onMouseDown = function (event) {
			if (!event) {
				dontDrag = true;
			}
			delta = {
				x: 0,
				y: 0,
			};
		};
		move.onMouseDrag = function (event) {
			if (dontDrag) {
				dontDrag = false;
				return;
			}
			delta.x += event.delta.x;
			delta.y += event.delta.y;
			paper.view.scrollBy([-delta.x, -delta.y]);

		};
		return move;
	})();



	//// end of tools behavior definitions

	// init end


	/*
	 * Public API
	 */


	this.zoom = (function initZoom() {
		const ZOOM_STEP_IN = Math.sqrt(Math.sqrt(Math.SQRT2));
		const ZOOM_STEP_OUT = Math.sqrt(Math.sqrt(Math.SQRT1_2));
		const FRAMES = 4;
		const MIN_ZOOM = 1/4;
		const MAX_ZOOM = 4;
		var zoomCenter;
		var zoomDirection = 0;

		function zoom(direction, clientCenter) {
			zoomCenter = clientCenter ? paper.view.getEventPoint({
				clientX: clientCenter.x,
				clientY: clientCenter.y,
			}) : paper.view.center;
			zoomDirection += direction*FRAMES;
		};

		$(function(){
			paper.view.onFrame = function(event) {
				if (zoomDirection !== 0) {
					var zoom = paper.view.getZoom();
					if (
						(zoomDirection > 0 && zoom < MAX_ZOOM && !almostEquals(zoom, MAX_ZOOM)) ||
						(zoomDirection < 0 && zoom > MIN_ZOOM && !almostEquals(zoom, MIN_ZOOM))
					) {
						if (zoomDirection < 0) {
							++zoomDirection;
							paper.view.scale(ZOOM_STEP_OUT, zoomCenter);
							cursorManager.copeZoom(ZOOM_STEP_OUT);
						}
						if (zoomDirection > 0) {
							--zoomDirection;
							paper.view.scale(ZOOM_STEP_IN, zoomCenter);
							cursorManager.copeZoom(ZOOM_STEP_IN);
						}

						gui.setZoomInfo(paper.view.getZoom());
					} else {
						zoomDirection = 0;
					}
				}
			};
		});

		return zoom;
	})();

	this.changeToolTo = function(toolname){
		if(toolname in _tools){
			gui.changeCursor(toolname);
			gui.highlightTool(toolname);
			if(toolname === 'text') {
				_textItem.visible = true;
			} else {
				_textItem.visible = false;
			}
			switch(_currentToolName){
				case "pencil":
				case "brush":
				case "line":
				case "arrow":
				case "rectangle":
				case "oval":
				case "heart":
				case "text":
				case "textEdit":
				case "pathEdit":
					_tools[_currentToolName].abort();
			}
			switch(toolname) {
				case "textEdit":
				case "pathEdit":
					_tools[toolname].init();
					break;
				case "move":
					_tools[toolname].onMouseDown();
					break;
			}
			_tools[toolname].activate();
			_currentToolName = toolname;
			console.log('tool changed to', toolname);
		} else {
			console.error("unknown tool", toolname);
		}
	};

	this.setColor = function(color) {
		_color = color;
		_textItem.fillColor = color;
		gui.setColorOfPicker(color);
	};

	this.setSize = function(size) {
		_size = size;
		_textItem.fontSize = size * 6 + 4;
	};


	this.unselectAll = function() {
		paper.project.deselectAll();
	};

	this.deleteSelected = function() {
		eraseItems(paper.project.selectedItems);
	};

	this.moveSelected = function(dirrection) {
		var x = 0;
		var y = 0;
		var step = 5;
		if(paper.Key.isDown('control')) { // fast
			step *= 5;
		}
		if(paper.Key.isDown('shift')) { // slow
			step /= 5;
		}
		switch(dirrection){
			case 'up':
				y -= step; break;
			case 'down':
				y += step; break;
			case 'left':
				x -= step; break;
			case 'right':
				x += step; break;
		}

		var itemNumbers = paper.project.selectedItems.map(function(item) {
			return item.n;
		});
		app.postAction('translate', {
			ns: itemNumbers,
			delta: {x:x, y:y}
		});
	};

	this.getCurrentToolName = function(){
		return _currentToolName;
	};

	this.getBlob = function(fileType, callback) {
		if (typeof callback === "function") {
			if (fileType === "png") {
				var selected = paper.project.selectedItems;
				paper.project.deselectAll();

				paper.view.element.toBlob(function(blob){
					callback(blob);
					selected.forEach(function (item) {
						item.selected = true;
					});
				});
			}
			if (fileType === "svg") {
				var svgString = paper.project.exportSVG({asString:true});
				var blob = new Blob(
					[svgString],
					{type: "image/svg+xml"}
				);
				callback(blob);
			}
		}
	}

});


function almostEquals (a, b, e) {
	e = e || 1E-6;
	return Math.abs(a-b) < e;
}


function CursorManager(project) {
	var _cursorTemplate;
	var _hintTemplate;
	var _cursors = {};

	var mainLayer = project.activeLayer;
	var cursorsLayer = new paper.Layer();
	cursorsLayer.transformContent = false;
	mainLayer.activate();

	var style = {
		fillColor: '#fff',
		strokeColor: '#000',
		strokeWidth: 1,
		strokeScaling: false,
		shadowColor: new paper.Color(0, 0, 0, 0.25),
		shadowBlur: 2,
		shadowOffset: [3, 1.5],
		visible: false,
	};

	var hint = new paper.Shape.Circle([0, 0], 4);
	hint.set(style);

	cursorsLayer.importSVG('/img/cursor.svg', function(cursor) {
		cursor.scale(0.7);
		cursor.pivot = [7, 4];
		cursor.position = [0, 0];
		cursor.set(style);
		_cursorTemplate = cursor;
		_hintTemplate = hint;
		cursor.remove();
		hint.remove();
	});

	this.copeZoom = function(scaleFactor) {
		_cursorTemplate.scale(1/scaleFactor);
		_hintTemplate.scale(1/scaleFactor);
		for (cursorName in _cursors) {
			_cursors[cursorName].cursor.scale(1/scaleFactor);
			_cursors[cursorName].hint.scale(1/scaleFactor);
		}
	};

	this.exists = function(name){
		return !!(name in _cursors);
	};

	this.new = function(name, color) {
		if (name in _cursors) {
			throw "cursor with this name already exist";
		}

		var cursor = _cursorTemplate.clone();
		cursor.fillColor = color;
		cursorsLayer.addChild(cursor);

		var hint = _hintTemplate.clone();
		hint.fillColor = color;
		cursorsLayer.addChild(hint);

		_cursors[name] = {
			cursor: cursor,
			hint: hint,
		};
	};
	this.moveCursorTo = function (name, position, duration) {
		var steps = Math.floor(duration * (60/1000)) || 1;
		if (!(name in _cursors)) {
			throw "cursor with this name does not exist";
		}
		var cursor = _cursors[name].cursor;
		var hint = _cursors[name].hint;
		var destination = new paper.Point(position);
		var step = destination.subtract(cursor.position).divide(steps);
		cursor.onFrame = function(event) {
			if (event.count === steps) {
				cursor.onFrame = null;
			} else {
				cursor.translate(step);
				var borderPoint = findBorderPoint(paper.view.bounds, cursor.position);
				if (borderPoint) {
					cursor.visible = false;
					hint.visible = true;
					hint.position = borderPoint
				} else {
					hint.visible = false;
					cursor.visible = true;
				}
			}
		};
		var now = Date.now();
		setTimeout(function(then) {
			if (_cursors[name].lastActivity === then) {
				setInactive(name);
			}
		}, 1000*20, now);
		setActive(name);
		_cursors[name].lastActivity = now;
	};

	function findBorderPoint (rectangle, destination) {
		if (destination.isInside(rectangle)) {
			return null;
		}
		var centerToDest = destination.subtract(rectangle.center);

		var a = (rectangle.width/2) * Math.sign(centerToDest.x);
		var b = (a / centerToDest.x) * centerToDest.y;
		var centerToBounds = new paper.Point([a, b]);
		var borderPoint = rectangle.center.add(centerToBounds);

		if (borderPoint.isInside(rectangle)) {
			return borderPoint;
		}

		var b = (rectangle.height/2) * Math.sign(centerToDest.y);
		var a = (b / centerToDest.y) * centerToDest.x;
		var centerToBounds = new paper.Point([a, b]);
		var borderPoint = rectangle.center.add(centerToBounds);

		if (borderPoint.isInside(rectangle)) {
			return borderPoint;
		}

		return null;
	}

	function setInactive(name) {
		var cursor = _cursors[name].cursor;
		var hint = _cursors[name].hint;
		cursor.onFrame = hint.onFrame = fade;

		function fade(event) {
			if (this.opacity <= 0) {
				this.onFrame = null;
				this.opacity = 0;
			} else {
				this.opacity -= 0.02;
			}
		};
	};
	function setActive(name) {
		_cursors[name].cursor.opacity = 1;
		_cursors[name].hint.opacity = 1;
	};
}