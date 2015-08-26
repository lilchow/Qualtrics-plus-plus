var jq = $.noConflict();
var origiFormStyle;
var checkReadyInterval;

jq(function(){
    origiFormStyle=jq('form').css('visibility');
	jq('form').css('visibility','hidden');
	console.log('hide form');
});

var ht={};

var htLocker=htLocker||{};//persistent object
ht.fetchFromLocker=function(tag){
	return htLocker[tag];
}
ht.saveToLocker=function(tag,val){
	htLocker[tag]=val;
}

ht.setED0=Qualtrics.SurveyEngine.setEmbeddedData.bind(Qualtrics.SurveyEngine);//not really used
ht.getED0=Qualtrics.SurveyEngine.getEmbeddedData.bind(Qualtrics.SurveyEngine);//not really used therefore the 0 suffix
//ht.addED=Qualtrics.SurveyEngine.addEmbeddedData.bind(Qualtrics.SurveyEngine);

var htEDVault=htEDVault||{};//persistent object

ht.setED=function(edName,edVal){
	ht.setED0(edName,edVal);
	if(!htEDVault.hasOwnProperty(edName)){
		htEDVault[edName]=blocks.observable(edVal);
	}else{
		htEDVault[edName](edVal);
	}
	
};

ht.getED=function(edName,edVal){
	if (!ht.getED0(edName)) {
		console.log('ED non-existent; creating one');
		ht.setED(edName,edVal);
	}else{
		if(!htEDVault.hasOwnProperty(edName)){
			ht.setED(edName,ht.getED0(edName));
			}
	}
	return ht.getED0(edName);
};

ht.engine = Qualtrics.SurveyEngine;//barely needed

ht.keyQs={}; //this is for storing important question objects, with the next two functions, the user doesn't need to worry about this object.
ht.registerKeyQ=function(tag,q,setAsED){
	this.keyQs[tag]=q;
	var qId="#"+q.questionId;
	jq(qId).mouseleave(function(){
		ht.saveKeyQResp(tag,setAsED);
	});
};

ht.saveKeyQResp=function(tag,setAsED){//no need to call directly
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
	if(val && setAsED){
		ht.setED(tag,val);
		console.log(htEDVault);
	}
	
};

ht.protei={};//this is not exposed to the user
ht.addProteus=function(id,selector,options){
		this.protei[id]=options[ht.getED(selector)];
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
	this.renderTemplate();
	jq('form').css('visibility',origiFormStyle);
}

ht.templateObj={};
ht.renderTemplate=function(){//this is called in reveal form. user doesn't need to worry about it
	ht.templateObj=jq.extend(ht.protei,htEDVault);
	blocks.query(ht.templateObj);
	//blocks.query(ht.protei);
	//blocks.query(htEDVault);
};

if(ht.engine.hasOwnProperty("Page")){
	checkReadyInterval = setInterval(ht.checkPageReady, 40);
}
 