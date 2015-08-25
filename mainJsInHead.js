var jq = $.noConflict();
var origiFormStyle;
var checkReadyInterval;
var htLocker=htLocker||{};
jq(function(){
    origiFormStyle=jq('form').css('visibility');
	jq('form').css('visibility','hidden');
	console.log('hide form');
});

var ht={};

ht.fetchFromLocker=function(tag){
	return htLocker[tag];
}

ht.saveToLocker=function(tag,val){
	htLocker[tag]=val;
}

ht.setED=Qualtrics.SurveyEngine.setEmbeddedData.bind(Qualtrics.SurveyEngine);
ht.getED=Qualtrics.SurveyEngine.getEmbeddedData.bind(Qualtrics.SurveyEngine);
ht.addED=Qualtrics.SurveyEngine.addEmbeddedData.bind(Qualtrics.SurveyEngine);

ht.engine = Qualtrics.SurveyEngine;//barely needed

ht.keyQs={}; //this is for storing important question objects, with the next two functions, the user doesn't need to worry about this object.
ht.registerKeyQ=function(tag,q){
	this.keyQs[tag]=q;
	var qId="#"+q.questionId;
	var that=this;
	var qResp;
	jq(qId).mouseleave(function(){
		qResp=that.saveKeyQResp(tag);
	});
	if(qResp){
		ht.setED(tag,val);
	}
}

ht.saveKeyQResp=function(tag){//no need to call directly
	var q=this.keyQs[tag]
	var qInfo=q.getQuestionInfo();
	var qType=qInfo.QuestionType;
	var qSelect=qInfo.Selector;
	var choices=q.getChoices();
	var answers=q.getAnswers();

	var val;
	
	if(qType==='MC'){
		if (qInfo.Choices[q.getChoiceValue()]) val=qInfo.Choices[q.getChoiceValue()].Text;
		else val="";
		//val=choices.indexOf(q.getChoiceValue())+1;
	}else if(qType==="TE" && qSelect==="SL"){
		val=q.getChoiceValue();
	}else if(qType==="TE" && qSelect==="FORM"){
		val=jq.map(choices,function(val){
			return q.getTextValue(val);
		});
	}else if(qType==="Matrix"){
		val=jq.map(choices,function(val){
			if(qInfo.Answers[q.getChoiceValue(val)]) return qInfo.Answers[q.getChoiceValue(val)].Display;
			else return "";
			//return answers.indexOf(q.getChoiceValue(val))+1
		});
	}else if(qType==="Slider"){
		val=jq.map(choices,function(val){
			return Number(q.getChoiceValue(val));
		});
	}else{
		return;
	}
		
	this.saveToLocker(tag,val);
	return val;
	
};

ht.protei={};//this is not exposed to the user
ht.addProteus=function(id,selector,options){
		this.protei[id]=options[ht.getED(selector)];
	};
ht.unleashProtei=function(){//this is called in reveal form. user doesn't need to worry about it
	blocks.query(ht.protei);
};

ht.checkPageReady=function () {//no need to call directly
	if (!ht.engine.Page.__isReady) {
		console.log('not ready');
		return;
	}
	clearInterval(checkReadyInterval);
	console.log('production page ready');
	ht.pageReadyHandler();
};

ht.pageReadyHandler=function(){//this is the internal page ready handler, user needs to define their own onPageReady handler
	if (ht.onPageReady) {
		ht.onPageReady();
	} else {
		console.log('onPageReady function not found');
		ht.revealForm();
	}
};
ht.revealForm=function(){
	this.unleashProtei();
	jq('form').css('visibility',origiFormStyle);
}

if(ht.engine.hasOwnProperty("Page")){
	checkReadyInterval = setInterval(ht.checkPageReady, 40);
}
 