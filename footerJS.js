if (qPP.engine.hasOwnProperty("Page")) {
	checkReadyInterval = setInterval(qPP.checkPageReady, 30);
}else{
	setTimeout(function() {
		console.log('preview page ready');
		qPP.internalPageReadyHandler();
		},30);
}