// console.log('in background.js');
// chrome.webNavigation.onHistoryStateUpdated.addListener(
// 	function(details) {
// 		console.log('tab updated ' + details.url);
// 		chrome.tabs.sendMessage(details.tabId, {
// 			event: 'url_changed',
// 			url: details.url
// 		});
// 	});

/* poor man's test */
function isTextContentType(contentType) {
	if (contentType == null) {
		return false;
	}
	if (contentType.startsWith('text')) {
		return true;
	}
	switch (contentType) {
		case 'application/json':
		case 'application/xml':
			return true;
	}
	return false;
}

function loadAssignmentUrl(baseUrl, basePath, assignment, student, callback) {
	var path = "/" + basePath + "/grade/" + assignment.id + "?student=" + student.id;
	var url = baseUrl + path;

	var xhttp = new XMLHttpRequest();
	xhttp.open('GET', url, true);

	xhttp.onload = function() {
		if (xhttp.status !== 200) {
			console.log("Couldn't load student page " + url + "; status=" + xhttp.status);
			callback({
				succeeded: false,
				student: student
			});
			return;
		}

		// let's try to find the uploaded file url
		var parser = new DOMParser();
		var doc = parser.parseFromString(xhttp.responseText, "text/html");
		var links = doc.getElementsByTagName("a");
		var result = null;
		for (var i = 0; i < links.length; i++) {
			var ref = links[i].getAttribute('href');
			if (ref != null && ref.startsWith('/files/' + student.id)) {
				console.log('found! ' + ref);
				result = ref;
				break;
			}			
		}

		if (result == null) {
			console.log("Failed to find file url in: " + url);
			callback({
				succeeded: false,
				student: student
			});
			return;
		}
		var assignmentUrl = baseUrl + result;
		console.log("assignmentUrl for student " + student.id + " is: " + assignmentUrl);

		callback({
			succeeded: true,
			student: student,
			assignmentUrl: assignmentUrl
		});
	}

	xhttp.onerror = function() {
		callback({
			succeeded: false,
			student: student
		});
	}

	xhttp.send();
}

function downloadAssignment(assignmentUrl, student, callback) {
	var xhr = new XMLHttpRequest();
	xhr.open('GET', assignmentUrl, true);
	xhr.responseType = 'blob';

	xhr.onload = function(e) {
		if (xhr.status !== 200) {
			console.log("Couldn't download attachment for " + assignmentUrl + "; status=" + xhr.status);
			callback({
				succeeded: false
			});
			return;
		}

		var filename = assignmentUrl.substring(assignmentUrl.lastIndexOf('/') + 1);
		var contentType = xhr.getResponseHeader('content-type');
		var isBinary = !isTextContentType(contentType);

		console.log("downloaded attachment for: " + assignmentUrl);

		callback({
			succeeded: true,
			isBinary: isBinary,
			filename: student.name + '_' + filename,
			data: xhr.response
		});
	}

	xhr.onerror = function() {
	    callback({
			succeeded: false
		});
	}

	xhr.send();
}

function createAssignmentUrlPromise(baseUrl, basePath, assignment, student) {
	return new Promise(function(resolve, reject) {
		loadAssignmentUrl(baseUrl, basePath, assignment, student, function(result) {
			resolve(result);
		});
	});
}

function createDownloadAssignmentPromise(assignmentUrl, student, totalItems, tabId) {
	return new Promise(function(resolve, reject) {
		downloadAssignment(assignmentUrl, student, function(result) {
			chrome.tabs.sendMessage(tabId, {
				event: 'attachment_downloaded',
				itemsLength: totalItems
			});
			resolve(result);
		});
	});
}

chrome.runtime.onMessage.addListener(function(request, sender, callback) {
	if (request.action == 'download-all') {

		var assignmentUrlPromises = [];
		request.data.forEach(function(student) {
			var promise = createAssignmentUrlPromise(request.baseUrl, request.basePath, request.assignment, student);
			assignmentUrlPromises.push(promise);
		});

		Promise.all(assignmentUrlPromises).then(function(results) {
			console.log("all assignmentUrl promises completed!");

			var assignmentDownloadPromises = [];
			results.forEach(function(result) {
				if (!result.succeeded) {
					return;
				}
				var downloadPromise = createDownloadAssignmentPromise(result.assignmentUrl, result.student, request.data.length, sender.tab.id);
				assignmentDownloadPromises.push(downloadPromise);
			});
			
			Promise.all(assignmentDownloadPromises).then(function(results) {
				console.log("all assignmentDownload promises completed!");

				var zip = new JSZip();
				results.forEach(function(result) {
					if (!result.succeeded) {
						return;
					}
					zip.file(result.filename, result.data, { binary: result.isBinary });
				});

				zip.generateAsync({ type: "blob" }).then(function(content) {
					callback({
						finished: true
					});
					var url = URL.createObjectURL(content);
					chrome.downloads.download({
						url: url,
						filename: request.assignment.name + '.zip'
					});
					// saveAs(content, "some.zip");
				});
			});
		});

		return true; // prevents the callback from being called too early on return
	}
});