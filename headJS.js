var jq = $.noConflict();
var origiFormStyle;

jq(function () {
	origiFormStyle = jq('form').css('visibility');
	jq('form').css('visibility', 'hidden');
});

var previewEDLocker = previewEDLocker || {};

var qPP = {};
qPP.engine = Qualtrics.SurveyEngine; //barely needed

qPP.edLocker = qPP.engine.Page ? qPP.engine.Page.runtime.ED : previewEDLocker; //this is an object
var qPPBeamer = qPPBeamer || {}; //persistent object; it contains beamables; beamables are enhanced ED so they share the same tag. Every beamable has a counterpart in edLocker

qPP.setED = function (tag, val) {
	qPP.edLocker[tag] = val;
};
//Qualtrics.SurveyEngine.setEmbeddedData.bind(Qualtrics.SurveyEngine); //not really used
qPP.getED = function (tag) {
	return qPP.edLocker[tag];
};
//Qualtrics.SurveyEngine.getEmbeddedData.bind(Qualtrics.SurveyEngine); //not really used therefore the 0 suffix
qPP.addED = function (tag, val) {
	qPP.edLocker[tag] = val;
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

qPP.beamifyED = function (edTag, edVal) { //this function might not be used at all
	//edVal is used when ED doesn't exist
	if (!qPP.getED(edTag)) {
		console.log('pure ED non-existent; creating one with supplied value');
		qPP.setBeamableED(edTag, edVal);
		return;
	}
	qPP.setBeamableED(edTag, qPP.getED(edTag));
};

qPP.beamifyAllEDs = function () {
	console.log('all existing EDs:', Object.keys(qPP.edLocker));
	jq.each(qPP.edLocker, function (tag, val) {
		qPP.setBeamableED(tag, val);
	});
};

qPP.setTmpBeamableED = function (beamableTag, beamableVal) { //set temporary beamable ED for block preview purpose
	if (qPP.engine.Page) return;
	qPP.setBeamableED(beamableTag, beamableVal);
};

qPP.setBeamableED = function (beamableTag, beamableVal) { //this function is normally called by registerQ or by showPage set all EDs beamable
	qPP.setED(beamableTag, beamableVal);
	if (!qPPBeamer.hasOwnProperty(beamableTag)) {
		qPPBeamer[beamableTag] = blocks.observable(beamableVal);
	} else {
		qPPBeamer[beamableTag](beamableVal);
	}
};

qPP.setDependentBeamable = function (beamableTag, valueTree, dependencyArray) { //dependent beamables should NOT be stored in ED system
	if (qPP.edLocker.hasOwnProperty(beamableTag)) {
		return;
	}
	if (!Array.isArray(dependencyArray)) {
		return;
	}
	//check for existence of contingency tags in beamer and the contingent beamable's tag is not contained in the contingency tags array
	var dependencyValid = true;
	jq.each(dependencyArray, function (idx, tag) {
		if (beamableTag === tag || !qPPBeamer.hasOwnProperty(tag)) {
			dependencyValid = false;
			return false;
		}
	});

	if (!dependencyValid) {
		return;
	}
	qPPBeamer[beamableTag] = blocks.observable(function () {
		return dependencyArray.reduce(function (prev, current) {
			return prev[qPPBeamer[current]()];
		}, valueTree);
	});
};

qPP.checkPageReady = function () { //no need to call directly
	if (qPP.engine.Page.__isReady) {
		console.log('production page ready');
		qPP.internalPageReadyHandler();
		return;
	}
	console.log('page not ready');
	setTimeout(qPP.checkPageReady, 30);
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
	try {
		blocks.query(qPPBeamer);
	} catch (err) {
		toastr["error"](err.message, "ERROR")
	} finally {
		jq('form').css('visibility', origiFormStyle);
	}
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

qPP.hideButtons = function () {
	if (qPP.engine.hasOwnProperty("Page")) {
		if (qPP.engine.Page.__isReady) {
			jq('#Buttons').hide();
			return;
		}
		setTimeout(qPP.hideButtons, 50);
	} else {
		jq('#Buttons').hide();
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

qPP.createVideoPlayer = function (q,videoUrl, videoFileW, videoFileH, scaleFactor) {
	jq("#" + q.questionId+' .QuestionText').html('').addClass('ht-bt')
		.prepend('<div id="vPlayerContainer" class="center-block text-center"><kbd id="videoStatus">video status</kbd></div>');
	var statusMsg = jq('#videoStatus');
	var assetBaseUrl = "https://cdn.rawgit.com/lilchow/Qualtrics-plus-plus/master/commonAssets/";

	var videoW = scaleFactor * videoFileW;
	var videoH = scaleFactor * videoFileH;
	var vPlayerWPadding = videoH * 0.10;
	var vPlayerHPadding = videoH * 0.15;

	var bootState = {
		preload: function () {
			vPlayer.load.baseURL = assetBaseUrl;
			vPlayer.scale.pageAlignHorizontally = true;
			vPlayer.scale.refresh();
			vPlayer.load.image('progressBar', 'progressBar.png');
		},
		create: function () {
			vPlayer.stage.backgroundColor = "#333";
			vPlayer.state.start('load');
		}
	};

	var loadState = {
		preload: function () {
			var progressBar = vPlayer.add.sprite(vPlayer.world.centerX, vPlayer.world.centerY, 'progressBar');
			progressBar.anchor.setTo(0.5, 0.5);
			vPlayer.load.setPreloadSprite(progressBar);
			vPlayer.load.video('video', videoUrl);
			vPlayer.load.spritesheet('ppBtn', 'playpause.jpg', 40, 40);
			vPlayer.load.image('volUBtn', 'volUBtn.jpg');
			vPlayer.load.image('volDBtn', 'volDBtn.jpg');
		},
		create: function () {
			vPlayer.state.start('play');
		}
	};

	var playState = {
		create: function () {
			statusMsg.text('video ready and click PLAY to play');

			this.ppBtn = vPlayer.add.button(vPlayer.world.centerX, vPlayer.world.height, 'ppBtn', this.togglePlay, this, 1, 1, 1, 1);
			this.ppBtn.anchor.setTo(0.5, 1);
			this.ppBtn.height = this.ppBtn.width = vPlayerHPadding * 0.7;


			var volUBtn = vPlayer.add.button(vPlayer.world.width, vPlayer.world.centerY, 'volUBtn', this.incVol, this);
			volUBtn.anchor.setTo(1, 0.5);
			volUBtn.height = volUBtn.width = vPlayerWPadding * 0.7;
			volUBtn.y = volUBtn.y - volUBtn.height;

			var volDBtn = vPlayer.add.button(vPlayer.world.width, vPlayer.world.centerY, 'volDBtn', this.decVol, this);
			volDBtn.anchor.setTo(1, 0.5);
			volDBtn.height = volDBtn.width = vPlayerWPadding * 0.7;
			volDBtn.y = volDBtn.y + volDBtn.height;

			this.video = vPlayer.add.video('video');
			this.video.onComplete.add(this.onVideoComplete, this);
			this.video.volume = 0.5;
			this.video.paused = true;
			this.videoSprite = this.video.addToWorld(vPlayerWPadding * 0.1, vPlayerHPadding * 0.1, 0, 0, scaleFactor, scaleFactor);


		},
		update: function () {

		},
		togglePlay: function () {
			if (this.video.paused) {
				this.playVideo();
			} else {
				this.pauseVideo();
			}
		},
		playVideo: function () {
			statusMsg.text('video playing');
			this.ppBtn.setFrames(0, 0, 0, 0);
			this.video.paused = false;
			this.video.play();
		},
		pauseVideo: function () {
			statusMsg.text('video paused');
			this.ppBtn.setFrames(1, 1, 1, 1);
			this.video.paused = true;
		},
		incVol: function () {
			console.log(this.video.volume);
			if (this.video.volume < 1) {
				this.video.volume += 0.1;
			}
		},

		decVol: function () {
			console.log(this.video.volume);
			if (this.video.volume > 0) {
				this.video.volume -= 0.1;
			}
		},

		onVideoComplete: function () {
			statusMsg.text('video completed');
			this.postCompleteProcessing();
		},

		postCompleteProcessing: function () {
			vPlayer.state.start('end');
		}

	};

	var endState = {
		create: function () {
			jq('#Buttons').show();
		}
	};

	var vPlayer = new Phaser.Game(videoW + vPlayerWPadding, videoH + vPlayerHPadding, Phaser.CANVAS, 'vPlayerContainer');
	vPlayer.state.add('boot', bootState);
	vPlayer.state.add('load', loadState);
	vPlayer.state.add('play', playState);
	vPlayer.state.add('end', endState);
	vPlayer.state.start('boot');
	console.log('try playing video');
	qPP.hideButtons();
	

};

//this is setting the notification system with toastr
toastr.options = {
	"closeButton": true,
	"debug": false,
	"newestOnTop": false,
	"progressBar": false,
	"positionClass": "toast-top-center",
	"preventDuplicates": true,
	"onclick": null,
	"showDuration": "0",
	"hideDuration": "0",
	"timeOut": "1000000",
	"extendedTimeOut": "0"
};