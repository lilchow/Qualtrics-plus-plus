var jq = $.noConflict();
var qPPSignal = signals.Signal;
var origiFormStyle;

jq(function () {
	origiFormStyle = jq('form').css('visibility');
	jq('form').css('visibility', 'hidden');
});

var previewEDLocker = previewEDLocker || {};

var qPPBeamer = qPPBeamer || {
	ect: {}, //ED contigent text
	ecl: {} //ED contigent link
}; //persistent object; it contains beamables; beamables are enhanced ED so they share the same tag. Every beamable has a counterpart in edLocker

var qPP = {};
qPP.windowLoadedSgn = new qPPSignal();
qPP.pageReadySgn = new qPPSignal();
qPP.engine = Qualtrics.SurveyEngine; //barely needed
qPP.mdCnt = 0; //count the number of questions which have mdModeOn
qPP.rawEDLocker = qPP.engine.Page ? qPP.engine.Page.runtime.ED : previewEDLocker; //edLocker only stores snapshot of ED that can be used in flow or display logic

qPP.registeredQs = {}; //this is for storing important question objects, with the next two functions, the user doesn't need to worry about this object.

qPP.saveRespAsED = function (q, tag) { //ED means ED plus
	//dynamically monitoring the answer and set it to both ED and beamable
	qPP.registeredQs[tag] = q;
	qPP.setED(tag, qPP.getRawED(tag) || null);
	var qId = "#" + q.questionId;
	jq(qId).mouseleave(function () {
		var resp = qPP.obtainQResp(q);
		if (!resp) {
			return;
		}
		qPP.setED(tag, resp);
	});

};

qPP.registerImgs = function (q, tag) {
	var imgs = jq('#' + q.questionId).find('.QuestionText').find('img');
	if (imgs.length === 1) {
		qPPBeamer.ecl[tag] = blocks.observable(imgs.attr('src'));
	} else {
		var arr = [];
		imgs.each(function () {
			arr.push(jq(this).attr('src'));
		});
		qPPBeamer.ecl[tag] = blocks.observable(arr);
	}


};

qPP.upgradeRawED = function (edTag) { //this function might not be used at all
	// if raw ED doesn't exist or it has already been upgraded, simply ignore
	if (!qPP.getRawED(edTag) || qPPBeamer.hasOwnProperty(edTag)) {
		return;
	}
	qPP.setBeamerED(edTag, qPP.getRawED(edTag));
};

qPP.upgradeAllRawEDs = function () { //called at the begnning of every page, if locker has new raw ED it will be fed to Beamer
	console.log('all existing raw EDs:', Object.keys(qPP.rawEDLocker));
	jq.each(qPP.rawEDLocker, function (tag) {
		qPP.upgradeRawED(tag);
	});
};

qPP.setED = function (edTag, edVal) { //this function is normally called by registerQ or by showPage set all EDs beamable
	qPP.setRawED(edTag, edVal);
	qPP.setBeamerED(edTag, edVal);
};

qPP.softSetED = function (edTag, edVal) { //set temporary beamable ED for block preview purpose
	if (qPP.rawEDLocker.hasOwnProperty(edTag)) {
		return;
	}
	qPP.setED(edTag, edVal);
};

qPP.setCompositeED = function (edTag, formula) {
	if (qPPBeamer.hasOwnProperty(edTag)) {
		return;
	}

	var regPattern = /[A-Za-z_]\w+(?=[)+*/-]+|$|\s+)/g;
	var dependencyEDArray = [];

	formula = formula.replace(regPattern, function (match) {
		dependencyEDArray.push(match);
		return ['qPPBeamer[', '"', match, '"]()'].join('');
	});

	if (dependencyEDArray.length === 0) {
		return;
	}
	var dependencyValid = true;
	jq.each(dependencyEDArray, function (idx, tag) {
		if (!qPPBeamer.hasOwnProperty(tag)) {
			dependencyValid = false;
			return false;
		}
	});

	if (!dependencyValid) {
		return;
	}

	console.log(edTag, ":", formula);

	qPPBeamer[edTag] = blocks.observable(function () {
		var newValue;
		try{
			newValue=eval(formula);
		}catch(err){
			newValue=null;
		} 
		qPP.setRawED(edTag, newValue);
		return newValue;
	});

	qPP.setRawED(edTag, qPPBeamer[edTag]());
};

qPP.setEDContigentText = function (ectTag, valueTree, contigencyEDArray) { //dependent beamables should NOT be stored in ED system
	if (ectTag === 'ect' || ectTag === 'ecl' || !Array.isArray(contigencyEDArray)) {
		return;
	}
	//check for existence of contingency tags in beamer and the contingent beamable's tag is not contained in the contingency tags array
	var dependencyValid = true;
	jq.each(contigencyEDArray, function (idx, tag) {
		if (!qPPBeamer.hasOwnProperty(tag)) {
			dependencyValid = false;
			return false;
		}
	});

	if (!dependencyValid) {
		return;
	}
	qPPBeamer.ect[ectTag] = blocks.observable(function () {
		return contigencyEDArray.reduce(function (prev, current) {
			return prev[qPPBeamer[current]()];
		}, valueTree);
	});
};

qPP.setRawED = function (tag, val) {
	qPP.rawEDLocker[tag] = val;
};
//Qualtrics.SurveyEngine.setEmbeddedData.bind(Qualtrics.SurveyEngine); //not really used
qPP.getRawED = function (tag) {
	return qPP.rawEDLocker[tag];
};

qPP.setBeamerED = function (edTag, edVal) {
	if (!qPPBeamer.hasOwnProperty(edTag)) {
		qPPBeamer[edTag] = blocks.observable(edVal);
	} else {
		qPPBeamer[edTag](edVal);
	}
};



qPP.internalPageReadyHandler = function () { //this is the internal page ready handler, user needs to define their own onPageReady handler
	console.log('page ready');
	qPP.upgradeAllRawEDs();
	qPP.pageReadySgn.dispatch();
	if (qPP.onPageReady) {
		console.log('run custom onPageReady function');
		qPP.onPageReady();
	} else {
		console.log('no custom onPageReady function');
		qPP.renderPage();
	}
};

qPP.renderPage = function () {
	if (qPP.mdCnt > 0) {
		qPP.renderMD();
	} else {
		try {
			blocks.query(qPPBeamer);
		} catch (err) {
			toastr["error"](err.message, "ERROR");
		} finally {
			qPP.disablePaste();
			jq('form').css('visibility', origiFormStyle);
		}
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

qPP.addNonFormHint = function (q, hint) {
	var qInfo = q.getQuestionInfo();
	if (qInfo.QuestionType === 'TE' && qInfo.Selector !== 'FORM') {
		jq("#" + q.questionId).find('.InputText').attr("placeholder", hint);
	}
};

qPP.decorateSingleLine = function (q, pre, post, width) {
	var qInfo = q.getQuestionInfo();
	if (qInfo.QuestionType === 'TE' && qInfo.Selector === 'SL') {
		jq("#" + q.questionId).find('.InputText')
			.css('display', 'inline')
			.before('<span>' + pre + "</span>")
			.after('<span>' + post + "</span>")
			.width(width + 'px');
	}
};

qPP.hideButtons = function (time) { //time in seconds
	qPP.pageReadySgn.add(function () {
		jq('#Buttons').hide();
		if (!time) {
			return;
		}
		setTimeout(function () {
			jq('#Buttons').show();
		}, time * 1000);
	});
};

qPP.mdModeOn = function (q) {
	qPP.mdCnt++;
	jq('#' + q.questionId).find('.QuestionText')
		.addClass('ht-bt mdMode');
};

qPP.renderMD = function () {
	var ele = jq('.ht-bt.mdMode').eq(--qPP.mdCnt);
	var txt = ele.text().replace(/^\s*/, "");
	marked(txt, {
		renderer: qPP.mdRenderer
	}, function (err, htmlCode) {
		ele.html(htmlCode);
		if (qPP.mdCnt > 0) {
			qPP.renderMD();
		} else {
			qPP.renderPage();
		}
	});
};

qPP.disablePaste = function () {
	jq(document).on("cut copy paste", ".QuestionBody input:text, .QuestionBody textarea", function (e) {
		e.preventDefault();
	});
};

qPP.respToNumber = function (resp) {
	if (isNaN(resp)) {
		return resp;
	} else {
		return Number(resp);
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
			resp = qPP.respToNumber(resp);
			//resp=choices.indexOf(q.getChoiceValue())+1;
		} else {
			resp = "";
		}
		break;
	case qType === "TE" && qSelector !== "FORM":
		resp = q.getChoiceValue();
		resp = qPP.respToNumber(resp);
		break;
	case qType === "TE" && qSelector === "FORM":
		resp = jq.map(choices, function (val) {
			return qPP.respToNumber(q.getTextValue(val));
		});
		break;
	case qType === "Matrix":
		resp = jq.map(choices, function (val) {
			if (qInfo.Answers[q.getSelectedAnswerValue(val)]) {
				return qPP.respToNumber(qInfo.Answers[q.getSelectedAnswerValue(val)].Display);
			} else {
				return "";
			}
			//return answers.indexOf(q.getChoiceValue(val))+1
		});
		break;
	case qType === "Slider":
		resp = jq.map(choices, function (val) {
			return qPP.respToNumber(q.getChoiceValue(val));
		});
		break;
	}
	console.log('obtained response: ', resp);
	return resp;
};

qPP.createVideoPlayer = function (q, videoUrl, videoFileW, videoFileH, scaleFactor) {
	var containerParent;
	if (!q.questionId) {
		containerParent = jq(' .QuestionText');
	} else {
		containerParent = jq("#" + q.questionId + ' .QuestionText');
	}

	containerParent.addClass('ht-bt').append('<div id="vPlayerContainer" class="center-block text-center"></div>');

	var assetBaseUrl = "https://cdn.rawgit.com/lilchow/Qualtrics-plus-plus/master/commonAssets/";

	var videoW = scaleFactor * videoFileW;
	var videoH = scaleFactor * videoFileH;
	var vPlayerHPadding = 18;

	var statusMsg;
	var msgTextStyle = {
		font: Math.floor(vPlayerHPadding * 0.7) + 'px Arial',
		fill: '#bbb',
		align: 'center'
	};


	var bootState = {
		preload: function () {
			vPlayer.load.baseURL = assetBaseUrl;
			vPlayer.scale.pageAlignHorizontally = true;
			vPlayer.scale.refresh();
			vPlayer.load.image('progressBar', 'progressBar.png');
		},
		create: function () {
			vPlayer.stage.backgroundColor = "#333";
			console.log('boot completed');
			vPlayer.state.start('load');
		}
	};

	var loadState = {
		preload: function () {
			vPlayer.add.text(vPlayer.world.centerX, vPlayer.world.centerY - 10, 'loading video...', {
				font: '22px Arial',
				fill: '#ccc'
			}).anchor.setTo(0.5, 1);
			var progressBar = vPlayer.add.sprite(vPlayer.world.centerX, vPlayer.world.centerY, 'progressBar');
			progressBar.anchor.setTo(0.5, 0);
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

			statusMsg = vPlayer.add.text(vPlayer.world.centerX, videoH, '', msgTextStyle);
			statusMsg.anchor.setTo(0.5, 0);
			statusMsg.text = 'video ready and click PLAY to play';

			this.ppBtn = vPlayer.add.button(0, vPlayer.world.height, 'ppBtn', this.togglePlay, this, 1, 1, 1, 1);
			this.ppBtn.anchor.setTo(0, 1);
			this.ppBtn.height = this.ppBtn.width = vPlayerHPadding;

			var volUBtn = vPlayer.add.button(vPlayer.world.width, vPlayer.world.height, 'volUBtn', this.incVol, this);
			volUBtn.anchor.setTo(1, 1);
			volUBtn.height = vPlayerHPadding;
			volUBtn.width = volUBtn.height * 0.75;

			var volDBtn = vPlayer.add.button(vPlayer.world.width, vPlayer.world.height, 'volDBtn', this.decVol, this);
			volDBtn.anchor.setTo(1, 1);
			volDBtn.height = vPlayerHPadding;
			volDBtn.width = volDBtn.height * 0.75;
			volDBtn.x = volDBtn.x - volUBtn.width;

			this.video = vPlayer.add.video('video');
			this.video.onComplete.add(this.onVideoComplete, this);
			this.video.volume = 0.5;
			this.video.paused = true;
			this.videoSprite = this.video.addToWorld(0, 0, 0, 0, scaleFactor, scaleFactor);

			vPlayer.onPause.add(this.pauseVideo, this);

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
			statusMsg.text = "video playing";
			this.ppBtn.setFrames(0, 0, 0, 0);
			this.video.paused = false;
			this.video.play();
		},
		pauseVideo: function () {
			statusMsg.text = "video paused";
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
			vPlayer.onPause.removeAll(this);
			this.postCompleteProcessing();
		},

		postCompleteProcessing: function () {
			vPlayer.state.start('end');
		}

	};

	var endState = {
		create: function () {
			vPlayer.add.text(vPlayer.world.centerX, vPlayer.world.centerY, 'The End', {
				font: '24px Arial',
				fill: '#fff'
			}).anchor.setTo(0.5, 0.5);
			jq('#Buttons').show();
		}
	};

	var vPlayer = new Phaser.Game(videoW, videoH + vPlayerHPadding, Phaser.CANVAS, 'vPlayerContainer');
	vPlayer.state.add('boot', bootState);
	vPlayer.state.add('load', loadState);
	vPlayer.state.add('play', playState);
	vPlayer.state.add('end', endState);
	vPlayer.state.start('boot');
	console.log('try playing video');
	qPP.hideButtons();


};

qPP.createAudioChecker = function (q, length) {
	if (!length) length = 4;
	var markerSet = [1, 2, 3, 4, 5, 6, 7, 8];
	var markerDurations = [574, 679, 679, 679, 626, 783, 731, 501];
	var markerStartPoints = markerDurations.concat();
	for (var i = 0; i < markerSet.length; i++) {
		markerStartPoints[i] = markerDurations.slice(0, i + 1).reduce(function (p, i) {
			return p + i;
		});
	}
	markerStartPoints.pop();
	markerStartPoints.unshift(0);
	var chosenMarkerSet = qPP.shuffleArray(markerSet).slice(0, length);
	var usedMarkerSet = [];
	var answer = chosenMarkerSet.join(''); //this is the answer participant should type in

	var containerParent;
	if (!q.questionId) {
		containerParent = jq(' .QuestionText');
	} else {
		containerParent = jq("#" + q.questionId + ' .QuestionText');
	}

	containerParent.addClass('ht-bt').append('<div id="audioCheckerContainer" class="center-block"></div>');
	jq('#audioCheckerContainer').after('<div class="alert alert-danger">Code incorrect. Try again.</div>');
	jq('.alert-danger').hide();

	var assetBaseUrl = "https://cdn.rawgit.com/lilchow/Qualtrics-plus-plus/master/commonAssets/";

	var mainState = {
		preload: function () {
			audioChecker.load.baseURL = assetBaseUrl;
			audioChecker.scale.pageAlignHorizontally = true;
			audioChecker.scale.refresh();
			audioChecker.stage.backgroundColor = "#67727A";
			audioChecker.load.audio('totalClip', 'digits/digits.mp3');
		},
		create: function () {
			var btnW = 120,
				btnH = 60;
			this.playBtn = audioChecker.add.graphics(0, 0);
			this.playBtn.beginFill(0xD75C37, 1);
			this.playBtn.drawRoundedRect(audioChecker.world.width * 0.25 - btnW / 2, audioChecker.world.centerY - btnH / 2, btnW, btnH, 2);
			this.playBtn.inputEnabled = true;
			this.playBtn.input.useHandCursor = true;
			this.playBtnTxt = audioChecker.add.text(audioChecker.world.width * 0.25, audioChecker.world.centerY, 'PLAY CLIP', {
				font: '16px Arial',
				fill: '#000'
			})
			this.playBtnTxt.anchor.setTo(0.5, 0.5);
			this.playBtn.events
				.onInputDown.addOnce(this.tryPlayNext.bind(this), this);

			this.checkBtn = audioChecker.add.graphics(0, 0);
			this.checkBtn.beginFill(0x6991AC, 1);
			this.checkBtn.drawRoundedRect(audioChecker.world.width * 0.75 - btnW / 2, audioChecker.world.centerY - btnH / 2, btnW, btnH, 2);
			this.checkBtn.inputEnabled = true;
			this.checkBtn.input.useHandCursor = true;
			this.checkBtnTxt = audioChecker.add.text(audioChecker.world.width * 0.75, audioChecker.world.centerY, 'CHECK ENTRY', {
				font: '16px Arial',
				fill: '#111'
			});
			this.checkBtnTxt.anchor.setTo(0.5, 0.5);
			this.checkBtn.events
				.onInputDown.add(this.checkEntry.bind(this), this);

			this.totalClip = audioChecker.add.audio('totalClip');
			this.totalClip.allowMultiple = false;
			for (var i = 0; i < markerSet.length; i++) {
				this.totalClip.addMarker(String(i + 1), markerStartPoints[i] / 1000, markerDurations[i] / 1000);
			}

		},
		update: function () {
			//console.log(this.playBtnTxt.text);
		},
		tryPlayNext: function () {
			this.playBtnTxt.text = "PLAYING";
			this.playBtnTxt.fill = "#999";
			if (chosenMarkerSet.length > 0) {
				var tmp = chosenMarkerSet.shift();
				usedMarkerSet.push(tmp);
				this.totalClip.onStop
					.addOnce(this.tryPlayNext.bind(this), this);
				this.totalClip.play(String(tmp));
			} else {
				this.playCompleteHandler();
			}
		},
		checkEntry: function () {
			var entry = qPP.obtainQResp();
			if (!entry) {
				return;
			} else if (entry === answer) {
				jq('.alert-danger').hide();
				audioChecker.state.start('end');
			} else {
				jq('.alert-danger').show();
			}
		},
		playCompleteHandler: function () {
			chosenMarkerSet = usedMarkerSet.concat();
			usedMarkerSet = [];
			this.playBtnTxt.text = "REPLAY";
			this.playBtnTxt.fill = "#000";
			this.playBtn.events
				.onInputDown.addOnce(this.tryPlayNext.bind(this));
			console.log('all digits played and the answer is: ', answer);
		}

	};
	var endState = {
		create: function () {
			audioChecker.stage.backgroundColor = "#EAEAEA";
			audioChecker.add.text(audioChecker.world.centerX, audioChecker.world.centerY, 'Correct!', {
				font: '24px Arial',
				fill: '#111'
			}).anchor.setTo(0.5, 0.5);
			jq('#Buttons').show();
		}
	};

	var audioChecker = new Phaser.Game(400, 150, Phaser.CANVAS, 'audioCheckerContainer');
	audioChecker.state.add('main', mainState);
	audioChecker.state.add('end', endState);
	audioChecker.state.start('main');
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

//utility helper function
qPP.shuffleArray = function (array) {
	var currentIndex = array.length,
		temporaryValue, randomIndex;
	while (0 !== currentIndex) {
		randomIndex = Math.floor(Math.random() * currentIndex);
		currentIndex -= 1;
		temporaryValue = array[currentIndex];
		array[currentIndex] = array[randomIndex];
		array[randomIndex] = temporaryValue;
	}

	return array;
};

qPP.mdRenderer = new marked.Renderer();
qPP.mdRenderer.image = function (href, title, text) {
	var src = 'src="' + href + '"';
	var imgClass = text === 'center' ? 'class="center-block"' : '';
	var style = ['style="', "width: ", title, "px;", "height: auto;", "display: block;", '"'].join('');
	return ['<img', src, imgClass, style, '>'].join(' ');
};

//non attribute definition code
if (!qPP.engine.Page) {
	qPP.windowLoadedSgn.add(qPP.internalPageReadyHandler);
	qPP.engine.addOnload = function (handler) {
		if ($('body') && $('body').hasClassName('EditSection'))
			return;
		try {
			var obj = new Qualtrics.SurveyEngine.QuestionData();
			obj.onload = handler;
			qPP.windowLoadedSgn.add(obj.onload, obj, 2);
		} catch (e) {
			console.error('SE API Error: ' + e);
		}
	};
} else {
	qPP.engine.Page.once('ready', qPP.internalPageReadyHandler);
}

jq(window).load(function () {
	qPP.windowLoadedSgn.dispatch();
});