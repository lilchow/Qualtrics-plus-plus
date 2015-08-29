if (qPP.engine.hasOwnProperty("Page")) {
	qPP.checkPageReady();
}else{
	setTimeout(function() {
		console.log('preview page ready');
		qPP.internalPageReadyHandler();
		},30);
}