var jq = $.noConflict();
var origiFormStyle;
var checkReadyInterval;

jq(function () {
	origiFormStyle = jq('form').css('visibility');
	jq('form').css('visibility', 'hidden');
	console.log('hide form');
});

var ht = {};
ht.engine = Qualtrics.SurveyEngine; //barely needed

var htLocker = htLocker || {}; //persistent object
ht.fetchFromLocker = function (tag) {
	return htLocker[tag];
};
ht.saveToLocker = function (tag, val) {
	htLocker[tag] = val;
};

ht.setED = Qualtrics.SurveyEngine.setEmbeddedData.bind(Qualtrics.SurveyEngine); //not really used
ht.getED = Qualtrics.SurveyEngine.getEmbeddedData.bind(Qualtrics.SurveyEngine); //not really used therefore the 0 suffix
ht.addED = Qualtrics.SurveyEngine.addEmbeddedData.bind(Qualtrics.SurveyEngine);

var htBeamer = htBeamer || {}; //persistent object; it contains beamables




ht.registeredQs = {}; //this is for storing important question objects, with the next two functions, the user doesn't need to worry about this object.

ht.registerQ = function (q, qTag, edTag, beamableTag) {
	//dynamically monitoring the answer and set it to both ED and beamable
	if (!edTag) edTag = qTag;
	if (!beamableTag) beamableTag = edTag;
	ht.registeredQs[qTag] = q;
	var qId = "#" + q.questionId;
	jq(qId).mouseleave(function () {
		var resp = ht.obtainQResp(q);
		if (!resp) {
			return;
		}
		ht.setED(edTag, resp);
		ht.setStandaloneBeamable(beamableTag, resp);
	});

};


ht.obtainQResp = function (q) {
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

ht.setEDAsBeamable = function (edTag, edVal, beamableTag) {
	//edVal is used when ED doesn't exist
	if (!beamableTag) beamableTag = edTag;
	if (!ht.getED(edTag)) {
		console.log('ED non-existent; creating one');
		ht.setED(edTag, edVal);
	}
	ht.setStandaloneBeamable(beamableTag, ht.getED(edTag));
};

ht.setStandaloneBeamable = function (beamableTag, beamableVal) {
	if (!htBeamer.hasOwnProperty(beamableTag)) {
		htBeamer[beamableTag] = blocks.observable(beamableVal);
	} else {
		htBeamer[beamableTag](beamableVal);
	}
};
ht.setDependentBeamable = function (beamableTag, hostBeamableTag, alternatives) {
	if (!htBeamer[hostBeamableTag]) {
		return;
	}
	if (beamableTag === hostBeamableTag) {
		return;
	}

	htBeamer[beamableTag] = blocks.observable(function () {
		return alternatives[htBeamer[hostBeamableTag]()];
	});
};

ht.checkPageReady = function () { //no need to call directly
	if (!ht.engine.Page.__isReady) {
		console.log('not ready');
		return;
	}
	clearInterval(checkReadyInterval);
	console.log('production page ready');
	ht.pageReadyHandler();
};

ht.pageReadyHandler = function () { //this is the internal page ready handler, user needs to define their own onPageReady handler
	if (ht.onPageReady) {
		console.log('run custom onPageReady function');
		ht.onPageReady();
	} else {
		console.log('no custom onPageReady function');
		ht.showPage();
	}
};
ht.showPage = function () {
	blocks.query(htBeamer);
	jq('form').css('visibility', origiFormStyle);
};

ht.addFormHints = function (q, hints) {
	var qInfo = q.getQuestionInfo();
	if (qInfo.QuestionType === 'TE' && Array.isArray(hints) && qInfo.Selector === 'FORM') {
		var jqEle = jq("#" + q.questionId).find('.InputText');
		if (jqEle.length !== hints.length) {
			return;
		} else {
			jqEle.each(function (idx) {
				jq(this).attr("placeholder", hints[idx]);
			});
		}
	}

};

ht.addTextEntryHint = function (q, hint) {
	var qInfo = q.getQuestionInfo();
	if (qInfo.QuestionType === 'TE' && qInfo.Selector !== 'FORM') {
		jq("#" + q.questionId).find('.InputText').attr("placeholder", hint);
	}
};

ht.decorateTextEntry = function (q, pre, post, width) {
	var qInfo = q.getQuestionInfo();
	if (qInfo.QuestionType === 'TE' && qInfo.Selector === 'SL') {
		jq("#" + q.questionId).find('.InputText')
			.css('display', 'inline')
			.before('<span>' + pre + "</span>")
			.after('<span>' + post + "</span>")
			.width(width + 'px');
	}
};