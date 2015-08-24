
var jq = $.noConflict();
var htLocker=htLocker||{};

var ht={};

ht.setED=Qualtrics.SurveyEngine.setEmbeddedData.bind(Qualtrics.SurveyEngine);
ht.getED=Qualtrics.SurveyEngine.getEmbeddedData.bind(Qualtrics.SurveyEngine);
ht.addED=Qualtrics.SurveyEngine.getEmbeddedData.bind(Qualtrics.SurveyEngine);

ht.engine = Qualtrics.SurveyEngine;

ht.keyQs=[]; //this is for storing important question objects, with the next two functions, the user doesn't need to worry about this array.
ht.addKeyQ=function(q){
	this.keyQs.push(q);
}
ht.getKeyQ=function(i){
	if(i>this.keyQs.length) return;
	return this.keyQs[i-1];
};
ht.checkPageReady=function () {
	if (!ht.engine.Page.__isReady) {
		console.log('not ready yet');
		return;
	}
	clearInterval(tmpInterval);
	console.log('page ready');
	if (ht.onPageReady) {
		ht.onPageReady();
	} else {
		console.log('no ready handler');
	}
};

var tmpInterval = setInterval(ht.checkPageReady, 25);