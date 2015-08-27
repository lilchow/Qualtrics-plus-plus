var jq = $.noConflict();
var origiFormStyle;
var checkReadyInterval;

jq(function () {
	origiFormStyle = jq('form').css('visibility');
	jq('form').css('visibility', 'hidden');
});

var previewEDLocker=previewEDLocker||{};

var qPP = {};
qPP.engine = Qualtrics.SurveyEngine; //barely needed

qPP.edLocker=qPP.engine.Page?qPP.engine.Page.runtime.ED:previewEDLocker;//this is an object
var qPPBeamer = qPPBeamer || {}; //persistent object; it contains beamables; beamables are enhanced ED so they share the same tag. Every beamable has a counterpart in edLocker

qPP.setED = function(tag,val){
	qPP.edLocker[tag]=val;
};
	//Qualtrics.SurveyEngine.setEmbeddedData.bind(Qualtrics.SurveyEngine); //not really used
qPP.getED =function(tag){
	return qPP.edLocker[tag];
};
	//Qualtrics.SurveyEngine.getEmbeddedData.bind(Qualtrics.SurveyEngine); //not really used therefore the 0 suffix
qPP.addED = function(tag,val){
	qPP.edLocker[tag]=val;
};

	//Qualtrics.SurveyEngine.addEmbeddedData.bind(Qualtrics.SurveyEngine);


qPP.registeredQs = {}; //this is for storing important question objects, with the next two functions, the user doesn't need to worry about this object.

qPP.registerQ = function (q, tag) {
	//dynamically monitoring the answer and set it to both ED and beamable
	qPP.registeredQs[tag] = q;
	var qId = "#" + q.questionId;
	jq(qId).mouseleave(function () {
		var resp = qPP.obtainQResp(q);
		if (!resp) {
			return;
		}
		qPP.setBeamableED(tag, resp);
	});

};

qPP.beamifyED = function (edTag, edVal) {//this function might not be used at all
	//edVal is used when ED doesn't exist
	if (!qPP.getED(edTag)) {
		console.log('pure ED non-existent; creating one with supplied value');
		qPP.setBeamableED(edTag, edVal);
		return;
	}
	qPP.setBeamableED(edTag, qPP.getED(edTag));
};

qPP.beamifyAllEDs=function(){
	console.log('all existing EDs:',Object.keys(qPP.edLocker));
	jq.each(qPP.edLocker,function(tag,val){
		qPP.setBeamableED(tag,val);
		});
};

qPP.setTmpBeamableED=function (beamableTag, beamableVal){//set temporary beamable ED for block preview purpose
	if(qPP.engine.Page) return;
	qPP.setBeamableED(beamableTag,beamableVal);
};

qPP.setBeamableED = function (beamableTag, beamableVal) {//this function is normally called by registerQ or by showPage set all EDs beamable
	qPP.setED(beamableTag,beamableVal);
	if (!qPPBeamer.hasOwnProperty(beamableTag)) {
		qPPBeamer[beamableTag] = blocks.observable(beamableVal);
	} else {
		qPPBeamer[beamableTag](beamableVal);
	}
};

qPP.setDependentBeamable = function (beamableTag, valueTree, dependencyArray) {//dependent beamables should NOT be stored in ED system
	if(qPP.edLocker.hasOwnProperty(beamableTag)){
		return;
	}
	if (!Array.isArray(dependencyArray)) {
		return;
	}
	//check for existence of contingency tags in beamer and the contingent beamable's tag is not contained in the contingency tags array
	var dependencyValid=true;
	jq.each(dependencyArray,function (idx, tag) {
		if (beamableTag === tag || !qPPBeamer.hasOwnProperty(tag)){
			dependencyValid=false;
			return false;
		}
	});
	
	if(!dependencyValid){
		return;
	}
	qPPBeamer[beamableTag] = blocks.observable(function () {
		return dependencyArray.reduce(function(prev,current){
			console.log(prev,qPPBeamer[current]());
			return prev[qPPBeamer[current]()];
		},valueTree);
	});
};

qPP.checkPageReady = function () { //no need to call directly
	if (!qPP.engine.Page.__isReady) {
		console.log('not ready');
		return;
	}
	clearInterval(checkReadyInterval);
	console.log('production page ready');
	qPP.internalPageReadyHandler();
};

qPP.internalPageReadyHandler = function () { //this is the internal page ready handler, user needs to define their own onPageReady handler
	qPP.beamifyAllEDs();
	if (qPP.onPageReady) {
		console.log('run custom onPageReady function');
		qPP.onPageReady();
	} else {
		console.log('no custom onPageReady function');
		qPP.showPage();
	}
};
qPP.showPage = function () {
	blocks.query(qPPBeamer);
	jq('form').css('visibility', origiFormStyle);
};

qPP.addFormHints = function (q, hintArray) {
	var qInfo = q.getQuestionInfo();
	if (qInfo.QuestionType === 'TE' && Array.isArray(hintArray) && qInfo.Selector === 'FORM') {
		var jqEle = jq("#" + q.questionId).find('.InputText');
		if (jqEle.length !== hintArray.length) {
			return;
		} else {
			jqEle.each(function (idx) {
				jq(this).attr("placeholder", hintArray[idx]);
			});
		}
	}

};

qPP.addTextEntryHint = function (q, hint) {
	var qInfo = q.getQuestionInfo();
	if (qInfo.QuestionType === 'TE' && qInfo.Selector !== 'FORM') {
		jq("#" + q.questionId).find('.InputText').attr("placeholder", hint);
	}
};

qPP.decorateTextEntry = function (q, pre, post, width) {
	var qInfo = q.getQuestionInfo();
	if (qInfo.QuestionType === 'TE' && qInfo.Selector === 'SL') {
		jq("#" + q.questionId).find('.InputText')
			.css('display', 'inline')
			.before('<span>' + pre + "</span>")
			.after('<span>' + post + "</span>")
			.width(width + 'px');
	}
};


qPP.obtainQResp = function (q) {
	var qInfo = q.getQuestionInfo();
	var qType = qInfo.QuestionType;
	var qSelector = qInfo.Selector;
	var choices = q.getChoices();
	var answers = q.getAnswers();

	var resp = null;

	switch (true) {
	case qType === 'MC':
		if (q.getSelectedChoices()[0]) {
			resp = qInfo.Choices[q.getSelectedChoices()[0]].Text;
			//resp=choices.indexOf(q.getChoiceValue())+1;
		} else {
			resp = "";
		}
		break;
	case qType === "TE" && qSelector !== "FORM":
		resp = q.getChoiceValue();
		break;
	case qType === "TE" && qSelector === "FORM":
		resp = jq.map(choices, function (val) {
			return q.getTextValue(val);
		});
		break;
	case qType === "Matrix":
		resp = jq.map(choices, function (val) {
			if (qInfo.Answers[q.getSelectedAnswerValue(val)]) {
				return qInfo.Answers[q.getSelectedAnswerValue(val)].Display;
			} else {
				return "";
			}
			//return answers.indexOf(q.getChoiceValue(val))+1
		});
		break;
	case qType === "Slider":
		resp = jq.map(choices, function (val) {
			return Number(q.getChoiceValue(val));
		});
		break;
	}
	console.log('obtained response: ', resp);
	return resp;
};