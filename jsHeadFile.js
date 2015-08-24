var getED='getEmbeddedData';
var setED='setEmbeddedData';
var jq = $.noConflict();
var htLocker=htLocker||{};

var ht={};
ht.engine = Qualtrics.SurveyEngine;
ht.setED=Qualtrics.SurveyEngine.setEmbeddedData;
ht.keyQs=[]; //this is for storing important question objects
ht.addToKeyQs=function(q){
	this.keyQs.push(q);
}
ht.getKeyQ=function(i){
	if(i>=this.keyQs.length) return;
	return this.keyQs[i-1];
};
ht.checkPageReady=function () {
	if (!ht.engine.Page.__isReady) {
		console.log('initing...');
		return;
	}
	clearInterval(tmpInterval);
	if (ht.pageReadyHandler) {
		ht.pageReadyHandler();
	} else {
		console.log('no ready handler');
	}
};

var tmpInterval = setInterval(ht.checkPageReady, 25);