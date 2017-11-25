// alert("loaded!");
// console.log('in content.js'); 

function getLastPathElement(path) {
	let lastIndex = path.lastIndexOf('/');
	return lastIndex == -1 ? path : path.substr(lastIndex + 1);
}

function replaceAll(str, search, replacement) {
	// seems like this gives best performance on Chrome (see comments at https://stackoverflow.com/a/1145525/1233652)
	return str.split(search).join(replacement); 
}

var progressCounter = 0;

function initialize() {
	var intervalObj = setInterval(function() {
		var tableForms = $(".tableForm");
		if (tableForms.length > 0) {
			clearInterval(intervalObj);

			if (tableForms.length > 1) {
				// shouldn't happen
				console.log("found too many tableForms");
				return;
			}

			// console.log('tableForm found');
			var tableForm = tableForms[0];
			var studentData = [];

			$(tableForm).find('a').each(function() {
			    var title = $(this).attr('title');
			    if (title == undefined) {
			        return;
			    }
			    var href = $(this).attr('href');
			    var userId = getLastPathElement(href);
			    studentData.push({
			    	name: replaceAll(title, ', ', '_'),
			    	id: userId
			    });
			});

   			// best guess to find assignment's name
   			var nameCandidates = [];
   			$("body").find('h2').each(function() {
   				var id = $(this).attr('id');
   				if (id != undefined) {
   					return;
   				}
   				var text = $(this).text();
   				if (text === 'Grades') {
   					return;
   				}
   				nameCandidates.push(text);
   			});
   			var assignmentName = nameCandidates.length != 1 ? '' : replaceAll(nameCandidates[0], ' ', '_');

			var downloadAllButtons = $("#download-all-button");
			if (downloadAllButtons.length == 0) {
				var injected = $('<button id="download-all-button" class="button1" name="commit" type="submit">Download All Answers</button>');
				$(injected).insertBefore(tableForm);
				$('<br/>').insertBefore(injected);

				$(injected).click(function(e) {
					$(e.target).html("Downloading..");
					$(e.target).prop("disabled", true);

					var locationString = window.location.toString();
					var lastElement = getLastPathElement(locationString); locationString.substr(locationString.lastIndexOf('/') + 1);

					progressCounter = 0;

					chrome.runtime.sendMessage({
						action: 'download-all',
						assignment: {
							id: lastElement,
							name: assignmentName
						},
						data: studentData,
						baseUrl: window.location.origin
					}, function(result) {
						if (result.finished) {
							$(e.target).html("Downloaded!");
							var prevBackgroundColor = $(this).css("background-color");
							$(this).css("background-color","green");
							var prevBorderColor = $(this).css("border-color");
							$(this).css("border-color","green");
							var prevColor = $(this).css("color");
							$(this).css("color","white");

							setTimeout(function() {
								$(this).html("Download All Answers");
								$(this).css("background-color", prevBackgroundColor);
								$(this).css("border-color", prevBorderColor);
								$(this).css("color", prevColor);
								$(this).removeAttr('disabled');
							}.bind(this), 2000);
						}
					}.bind(this));
				});
			}
		} else {
			console.log('tableForm not found');
		}
	}, 100);
}

(function() {
    (function waitForCompletion() {
        if(document.readyState == "complete") {
        	initialize();
        } else {
            setTimeout(waitForCompletion, 300);
            // console.log('not in complete state');
        }
    })();
})();

chrome.runtime.onMessage.addListener(
	function(message, sender, sendResponse) {
		if (message != null) {
			// console.log('received message: ' + message.event);
			switch (message.event) {
				// case 'url_changed':
				// 	// console.log('url updated: ' + message.url);
				// 	initialize();
				// 	break;
				case 'attachment_downloaded':
					progressCounter++;
					if (progressCounter == message.itemsLength) {
						$("#download-all-button").html("Zipping..");
					} else {
						$("#download-all-button").html("Downloading [" + progressCounter + "/" + message.itemsLength + "]..");
					}
					break;
			}
		}
	});
