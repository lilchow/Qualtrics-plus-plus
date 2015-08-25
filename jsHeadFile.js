
var jq = $.noConflict();
var htLocker=htLocker||{};

var ht={};

ht.fetchFromLocker=function(tag){
	return htLocker[tag];
}

ht.saveToLocker=function(tag,val){
	htLocker[tag]=val;
}

ht.setED=Qualtrics.SurveyEngine.setEmbeddedData.bind(Qualtrics.SurveyEngine);
ht.getED=Qualtrics.SurveyEngine.getEmbeddedData.bind(Qualtrics.SurveyEngine);
ht.addED=Qualtrics.SurveyEngine.getEmbeddedData.bind(Qualtrics.SurveyEngine);

ht.engine = Qualtrics.SurveyEngine;

ht.keyQs={}; //this is for storing important question objects, with the next two functions, the user doesn't need to worry about this object.
ht.registerKeyQ=function(tag,q){
	this.keyQs[tag]=q;
	var qId="#"+q.questionId;
	var that=this;
	jq(qId).mouseleave(function(){
		that.saveKeyQResp(tag);
	});
}

ht.saveKeyQResp=function(tag){
	var q=this.keyQs[tag]
	var qInfo=q.getQuestionInfo();
	var qType=qInfo.QuestionType;
	var qSelect=qInfo.Selector;
	var choices=q.getChoices();
	var answers=q.getAnswers();

	var val;
	
	if(qType==='MC'){
		val=choices.indexOf(q.getChoiceValue())+1;
	}else if(qType==="TE" && qSelect==="SL"){
		val=q.getChoiceValue();
	}else if(qType==="TE" && qSelect==="FORM"){
		val=jq.map(choices,function(val){
			return q.getTextValue(val);
		});
	}else if(qType==="Matrix"){
		val=jq.map(choices,function(val){
			return answers.indexOf(q.getChoiceValue(val))+1
		});
	}else if(qType==="Slider"){
		val=jq.map(choices,function(val){
			return Number(q.getChoiceValue(val));
		});
	}else{
		return;
	}
		
	this.saveToLocker(tag,val);
	
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