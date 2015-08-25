
var jq = $.noConflict();
var htLocker=htLocker||{};

var ht={};

ht.saveToLocker=function(varName,varValue){
	htLocker[varName]=varValue;
}
ht.getFromLocker=function(varName){
	return htLocker[varName];
}

ht.setED=Qualtrics.SurveyEngine.setEmbeddedData.bind(Qualtrics.SurveyEngine);
ht.getED=Qualtrics.SurveyEngine.getEmbeddedData.bind(Qualtrics.SurveyEngine);
ht.addED=Qualtrics.SurveyEngine.getEmbeddedData.bind(Qualtrics.SurveyEngine);

ht.engine = Qualtrics.SurveyEngine;

ht.keyQs=[]; //this is for storing important question objects, with the next two functions, the user doesn't need to worry about this array.
ht.addKeyQ=function(q){
	this.keyQs.push(q);
}

//don't normally need to use it
ht.getKeyQ=function(i){
	if(i>this.keyQs.length) return null;
	return this.keyQs[i-1];
};

ht.saveKeyQResp=function(i,varName){
	if(!this.getKeyQ(i)) return;
	var q=this.getKeyQ(i)
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
	}
		
	this.saveToLocker(varName,val);
}
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