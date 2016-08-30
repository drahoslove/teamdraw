/* ========== MAIN ========== */

$(function(){

	var console = new Logger("main");

	var errormodal = $("#errormodal");
	var neterrormodal = $("#neterrormodal");
	var helpmodal = $("#helpmodal");


	// init

	if(location.hash === "" || location.hash === "#") {
		app.create(function(err){
			// TODO err
			console.error(err);
			$("#signmodal").modal("show");
		});
	} else {
		app.join(function(err, firstTime){
			// TODO err
			if(err){
				errormodal.modal("show");
			}
			console.error(err);
			if(firstTime || !app.getNick()){
				$("#signmodal").modal("show");
			} else { // already loggged in
				app.login(app.getNick(), function(err){
					// TODO err
					console.error(err);
				});
			}
		});
	}

	/* app events */

	app.on("userlist update", function(users){
		var userList = $("#userlist");

		console.log("Userlist update", users);

		$("#online-count").html(users.length);
		$("[title]", userList).tooltip("destroy");
		userList.empty();

		var me = users.find(function(user) {
			return user.nick === app.getNick()
		});

		users.forEach(function (user) {
			userList.append(gui.createUserElement(user, me));
		});
		gui.userListResize(true);
	});

	app.on("disconnected", function(){
		neterrormodal.modal("show");
	});

	app.on("connected", function(){
		neterrormodal.modal("hide");

		$("#alert").fadeIn("fast");
		setTimeout(function () {
			$("#alert").fadeOut("slow");
		}, 2000);
	});



	/* buttons events */

	$("#share-button").click(function(){
		$("#sharemodal").modal("show");
		$("#share-button").removeClass("btn-warning-c");
	});
	$("#help-button").click(function(){
		helpmodal.modal("show");
	});
	$("#new-button").click(function(){
		window.open(location.toString().split("#")[0]);
	});
	$("#save-button, #save-button-neterror").click(function() {
		$("#savemodal").modal("show");
	});
	$('#savemodal .save-file').click(function() {
		console.log('click');
		var fileType = $(this).attr('data-type');
		draw.getBlob(fileType, function(blob) {
			saveAs(blob, "teamdraw."+fileType);
			$("#savemodal").modal("hide");
		});
	})


	/* modals on show events */

	$("#signmodal").on("shown.bs.modal", function(){
		console.log("sign modal");
		$("#nick").focus();
		if(localStorage["nick"]){
			$("#nick").val(localStorage["nick"]);
		}
		$("#signmodal form").submit(function(event){
			event.preventDefault();
			var nick = $("#signmodal #nick").val();
			app.login(nick, function(err){
				console.error(err);
				if(err === null){
					console.log("nick ok");
					$("#signmodal").modal("hide");
					if (localStorage.firstRun === undefined) {
						$("#helpmodal").modal("show");
						localStorage.firstRun = false;
					}
				} else {
					$("#nickgroup").addClass("has-error");
					$("#nick").val("");
					$("#nick").attr("placeholder", err);
					console.log("Invalid Nick");
				}
			});
		});
	});

	$("#sharemodal").on("shown.bs.modal", function(){
		console.log("share modal");
		var link = location.toString().split("#")[0] + "#" + app.getToken();
		$("#sharemodal #link").val(link);
		$("#sharemodal #link").select();
		$("#sharemodal .btn-primary").click(function(){
			$("#sharemodal").modal("hide");
		});
	});


	$("#helpmodal .btn-primary").click(function(){
		helpmodal.modal("hide");
	});

	$("#errormodal .btn-primary").click(function(){
		location = location.pathname;
	});

	$(".export-img-button").click(function(event){
		event.preventDefault();
		var type = $(this).attr("data-img-type");
		console.log("exporting as",type);
		window.open($(this).attr("href"), "_blank");
		$("#savemodal").modal("hide");
	});


	/* toolbar */

	$(".btn-tool[data-tool]").click(function() {
		draw.selectTool($(this).attr("data-tool"));
	});
		

	/* other events */

	app.on("logged on", function(){

		$("#share-button").addClass("btn-warning-c");

		app.sync();

		draw.selectTool("pencil");

		draw.setColor("#333");
		draw.setSize(2);


		window.onbeforeunload = function(){
			app.save();
		};

		// key bindings
		$(window).keydown(function(event){
			if(draw.getCurrentToolName() !== "text") {
				switch(event.keyCode){
					case KeyCode.KEY_S:
						draw.selectTool("selector");
						break;
					case KeyCode.KEY_P:
						draw.selectTool("pencil");
						break;
					case KeyCode.KEY_B:
						draw.selectTool("brush");
						break;
					case KeyCode.KEY_E:
						draw.selectTool("eraser");
						break;
					case KeyCode.KEY_M:
						draw.selectTool("move");
						break;
					case KeyCode.KEY_C:
						draw.selectTool("eyedropper");
						break;
					case KeyCode.KEY_L:
						draw.selectTool("line")
						break;
					case KeyCode.KEY_O:
						draw.selectTool("oval");
						break;
					case KeyCode.KEY_R:
						draw.selectTool("rectangle")
						break;
					case KeyCode.KEY_T:
						draw.selectTool("text");
						event.preventDefault();
						break;

					case KeyCode.KEY_DELETE:
						draw.deleteSelected();
						break;
					case KeyCode.KEY_ESCAPE:
						draw.unselectAll();
						break;

					case KeyCode.KEY_TAB:
						// todo hide all gui
						event.preventDefault();
						break;

					case KeyCode.KEY_LEFT:
						draw.moveSelected("left");
						break;
					case KeyCode.KEY_UP:
						draw.moveSelected("up");
						break;
					case KeyCode.KEY_RIGHT:
						draw.moveSelected("right");
						break;
					case KeyCode.KEY_DOWN:
						draw.moveSelected("down");
						break;

					case KeyCode.KEY_PAGE_UP:
						draw.zoom(+1);
						break;
					case KeyCode.KEY_PAGE_DOWN:
						draw.zoom(-1);
						break;
				}
			} else {
				if(event.keyCode === KeyCode.KEY_ESCAPE) {
					draw.selectTool("selector");
				}
			}
		});

		// wheel scroll
		$(window).on("mousewheel", function(e){
			draw.zoom(e.deltaY, {x: e.clientX, y: e.clientY});
		});

		toggleToolWhileHoldingKey("move", KeyCode.KEY_SPACE);
		toggleToolWhileHoldingKey("eyedropper", KeyCode.KEY_ALT);

		function toggleToolWhileHoldingKey (toolname, keyCode) {
			var prevToolName = "";
			var pressed = false;
			$(window).keydown(function(event){
				if(event.keyCode === keyCode && !pressed) {
					event.preventDefault();
					pressed = true;
					prevToolName = draw.getCurrentToolName();
					draw.selectTool(toolname);
				}
			})
			$(window).keyup(function(event){
				if(event.keyCode === keyCode && pressed) {
					event.preventDefault(); // prevent spacebar to select outlined tool
					draw.selectTool(prevToolName);
					pressed = false;
				}
			});
		}

	}); // on logged on



});
