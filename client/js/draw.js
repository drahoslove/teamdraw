
var draw = new(function Draw(){

	var log = new tool.logger("draw");

	var _canvas;
	var _ctx;

	var _currentToolName = '';

	var _color = '#333';
	var _size = 2;

	var _tools = {};

	var _objects = [];

	// init
	$(function(){

		_canvas = $("#canvas");
		paper.setup(_canvas[0]);

		paper.view.onResize = function(event){
			paper.view.scrollBy([-event.delta.width/2, - event.delta.height/2]);
		}

		/** tools behavior **/
		var path;

		function getSelectOption(event) {
			var r = 3; // radius
			return {
				n: function(n){
					return n !== undefined;
				},
				// segments: function(segments){
				// 	if(!segments){
				// 		return false;
				// 	}
				// 	return segments.some(function(segment){
				// 		var v = segment.point;
				// 		return v.isClose(event.point, r);
				// 	});
				// },
				overlapping: new paper.Rectangle(event.point.add([r,r]), event.point.subtract([r,r])),
				// getNearestPoint: function(f){
				// 	return typeof f === "function" && f(event.point);
				// }			
				
			};
		}


		// pointer
		var pointer = new paper.Tool();
		_tools.pointer = pointer;
		pointer.onMouseDown = pointer.onMouseDrag = function(event){
			if(!event.modifiers.control && event.type !== 'mousedrag'){
				// unselect
				paper.project.selectedItems.forEach(function(item){
					item.selected = false;
				});
			}
			paper.project.getItems(getSelectOption(event)).forEach(function(item){
				item.selected = true;
			});
			paper.view.draw();
		}


		// pencil
		var pencil = new paper.Tool();
		_tools.pencil = pencil;
		pencil.minDistance = 5;
		// pencil.maxDistance = 5;
		pencil.onMouseDown = function(event){
			path = new paper.Path();
			path.strokeCap = 'round';
			path.strokeJoin = 'round';
			_objects.push(path);
			path.strokeColor = _color;
			path.strokeWidth = _size;
			path.add(event.point);
		};
		pencil.onMouseDrag = function(event){
			path.add(event.point);
		};
		pencil.onMouseUp = function(event){
			app.postAction("path", path.exportJSON({toString:false}));
			setTimeout(function(){
				path.remove(); // will be replaced with update from server
				paper.view.draw();
			}, 200);
		};

		// rectangle
		var rectangle = new paper.Tool();
		_tools.rectangle = rectangle;
		var start;
		rectangle.onMouseDown = function(event){
			start = event.point;
		};
		rectangle.onMouseUp = function(event){
			path = new paper.Path.Rectangle(start, event.point);
			path.strokeCap = 'round';
			path.strokeJoin = 'round';
			_objects.push(path);
			path.strokeColor = _color;
			path.strokeWidth = _size;
			app.postAction("path", path.exportJSON({toString:false}));
			setTimeout(function(){
				path.remove(); // will be replaced with update from server
				paper.view.draw();
			}, 200);
		};


		// eraser
		var eraser = new paper.Tool();
		_tools.eraser = eraser;
		eraser.onMouseDown = eraser.onMouseDrag = function(event){
			paper.project.getItems(getSelectOption(event)).forEach(function(item){
				item.visible = false;
				app.postAction("erase", item.n);
			});
			paper.view.draw();
		};
		eraser.onMouseMove = function(event){ // hover
			paper.project.selectedItems.forEach(function(item){
				item.selected = false;
			});
			paper.project.getItems(getSelectOption(event)).forEach(function(item){
				item.selected = true;
			});
			paper.view.draw();
		}


		// move
		var move = new paper.Tool();
		_tools.move = move;

		move.onMouseDrag = function(event){
			paper.view.scrollBy([-event.delta.x, -event.delta.y]);
			paper.view.draw();
		};


		/////////// end of tools behavior definitions

		app.on("update", function(action){
			// log("update", action.n, action);
			if(action.type === "path"){
				var item = new paper.Path();
				item.importJSON(action.data);
				item.n = action.n; // for deleting purposes
			}
			if(action.type === "erase"){
				var item = paper.project.getItem({
					n: action.data
				})
				if(!item){
					console.error("nothing with n=%d to erase", action.n);
				} else {
					item.remove();
				}
			}
			paper.view.draw();
		});



	}); // init end



	this.selectTool = function(toolname){
		if(toolname in _tools){
			_tools[toolname].activate();
			_currentToolName = toolname;
			gui.changeCursor(toolname);
			log('tool changed to', toolname);
		} else {
			console.error("unknown tool", toolname)
		}
	}

	this.setColor = function(color){
		$("#tool-outer-color").css({color: color});
		_color = color;
	}

	this.setSize = function(size){
		_size = size;
	}

	// this.deleteSelected = function(){
	// 	paper.project.selectedItems.forEach(function(item){
	// 		item.remove();
	// 	});
	// 	paper.view.draw();
	// };

	this.getCurrentToolName = function(){
		return _currentToolName;
	};


	// var _undoned = [];
	// this.undo = function(){
	// 	var item = _objects.pop();
	// 	if(item){
	// 		item.visible = false;
	// 		paper.view.draw();
	// 		_undoned.push(item);
	// 	}
	// }

	// this.redo = function(){
	// 	var item = _undoned.pop();
	// 	if(item){
	// 		_objects.push(item)
	// 		item.visible = true;
	// 		paper.view.draw();
	// 	}
	// };

	this.getUrl = function(){
		var svg = paper.project.exportSVG({asString:true});
		//add xml declaration
		svg = '<?xml version="1.0" standalone="yes"?>\r\n' + svg;
		//convert svg source to URI data scheme.
		var url = "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg);
		return url;
	}

});