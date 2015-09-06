var jq = $.noConflict();

var qPP = {};
qPP.engine = Qualtrics.SurveyEngine; //barely needed
qPP.signal = signals.Signal;

jq(function () {
	qPP.ogFormVisiblityStyle = jq('form').css('visibility');
	jq('form').css('visibility', 'hidden');
});


var previewEDValueLocker, compEDFormulaLocker, edEntityLocker, iVars; //the first two are only needed for non jfe mode
if (!qPP.engine.Page) {
	if (!sessionStorage.previewEDValueLocker) {
		previewEDValueLocker = {};
	} else {
		previewEDValueLocker = JSON.parse(sessionStorage.previewEDValueLocker);
	}
	if (!sessionStorage.compEDFormulaLocker) {
		compEDFormulaLocker = {};
	} else {
		compEDFormulaLocker = JSON.parse(sessionStorage.compEDFormulaLocker);
	}
	if (!sessionStorage.iVars) {
		iVars = {};
	} else {
		iVars = JSON.parse(sessionStorage.iVars);
	}
	edEntityLocker = { //note that session storage wont store blocks.observable
		atom: {}, //atomic
		comp: {} //composite ed
	};

} else {
	iVars = iVars || {};
	compEDFormulaLocker = compEDFormulaLocker || {};
	edEntityLocker = edEntityLocker || {
		atom: {}, //ED contigent text
		comp: {} //ED contigent link
	};
}

qPP.windowLoadedSgn = new qPP.signal();
qPP.pageReadySgn = new qPP.signal();
qPP.buttonsReadySgn = new qPP.signal();
qPP.buttonsReadySgn.memorize = true;
qPP.pageVisibleSgn = new qPP.signal();

qPP.mdCnt = 0; //count the number of questions which have mdModeOn
qPP.edValueLocker = qPP.engine.Page ? qPP.engine.Page.runtime.ED : previewEDValueLocker; //edLocker only stores snapshot of ED that can be used in flow or display logic


qPP._getEDType = function (typeTag) {
	var pattern = /^[a-z]+(?=[.]\w)/;
	if (!typeTag.match(pattern)) {
		return false;
	}
	return typeTag.match(pattern).pop();
};

qPP._getEDTag = function (typeTag) {
	return typeTag.replace(/^[a-z]+[.](?=\w)/, '');
};

qPP._getEDValue = function (typeTag) {
	return qPP.edValueLocker[typeTag];
};

qPP._setEDValue = function (typeTag, val) {
	qPP.edValueLocker[typeTag] = val;
};

qPP._getEDEntity = function (type, tag) {
	if (!edEntityLocker.hasOwnProperty(type)) {
		return null;
	} else if (!edEntityLocker[type].hasOwnProperty(tag)) {
		return null;
	} else {
		return edEntityLocker[type][tag];
	}
};

qPP._setEDEntity = function (type, tag, edVal) {
	if (!edEntityLocker[type].hasOwnProperty(tag)) {
		edEntityLocker[type][tag] = blocks.observable(edVal); //this is creating
	} else {
		edEntityLocker[type][tag](edVal); //this is updating
	}
};

qPP._entityfyRawEDValue = function (typeTag) {
	// only typed ED can be upgraded
	var type = qPP._getEDType(typeTag);
	if (!type || !qPP.edValueLocker.hasOwnProperty(typeTag)) {
		return;
	}
	var tag = qPP._getEDTag(typeTag);

	if (edEntityLocker[type].hasOwnProperty(tag)) {
		return; //only raw EDs that do not have beamer counterpart can be upgraded
	}
	qPP._setEDEntity(type, tag, qPP._getEDValue(typeTag));
};


qPP._entityfyAllRawEDValues = function () { //called at the begnning of every page, if locker has new raw ED it will be changed to ED entity
	console.log('all existing raw EDs:', Object.keys(qPP.edValueLocker));
	jq.each(qPP.edValueLocker, function (typeTag) {
		qPP._entityfyRawEDValue(typeTag);
	});
};


qPP.setAtomED = function (typeTag, edVal) { //called by users to set their own EDs. it must be typed
	var type = qPP._getEDType(typeTag);
	if (!type) {
		return;
	}
	var tag = qPP._getEDTag(typeTag);
	qPP._setEDValue(typeTag, edVal);
	qPP._setEDEntity(type, tag, edVal);
};

qPP.getAtomED = function (typeTag) {
	var type = qPP._getEDType(typeTag);
	if (type !== 'atom') {
		return;
	}
	var tag = qPP._getEDTag(typeTag);
	return blocks.unwrap(qPP._getEDEntity(type, tag));
};

qPP.softSetAtomED = function (typeTag, edVal) { //set temporary beamable ED for block preview purpose
	if (qPP.edValueLocker.hasOwnProperty(typeTag)) {
		return;
	}
	qPP.setAtomED(typeTag, edVal);
};

qPP._registeredQs = {}; //this is for storing important question objects, with the next two functions, the user doesn't need to worry about this object.

qPP.saveRespAsED = function (q, typeTag) { //ED means ED plus
	//dynamically monitoring the answer which cannot be composite ED

	if (!qPP._getEDType(typeTag)) {
		return;
	}

	qPP._registeredQs[typeTag] = q;
	qPP.setAtomED(typeTag, qPP._getEDValue(typeTag) || null);
	var qId = "#" + q.questionId;
	jq(qId).mouseleave(function () {
		var resp = qPP.obtainQResp(q);
		if (!resp) {
			return;
		}
		qPP.setAtomED(typeTag, resp);
	});

};

qPP._getCompEDFormula = function (formula) {
	var regPattern = /[a-z]+[.]\w+(?=[^(]+|$|\s+)/g; //only facio ED are selected
	var dependencyArray = formula.match(regPattern);
	if (!dependencyArray) {
		return null;
	}

	var dependencyValid = true;
	jq.each(dependencyArray, function (idx, typeTag) {
		var type = qPP._getEDType(typeTag);

		if (!type || !edEntityLocker[type].hasOwnProperty(qPP._getEDTag(typeTag))) {
			dependencyValid = false;
			return false;
		}
	});

	if (!dependencyValid) {
		return null;
	}

	formula = formula.replace(regPattern, function (typeTag) {
		return 'edEntityLocker["' + qPP._getEDType(typeTag) + '"]["' + qPP._getEDTag(typeTag) + '"]()';
	});
	console.log('formula: ', formula);
	return formula;
};

qPP.setCompED = function (typeTag, formula) {
	var type = qPP._getEDType(typeTag);
	if (type !== 'comp') {
		return;
	}
	var tag = qPP._getEDTag(typeTag);
	var rawFormula = formula;

	formula = qPP._getCompEDFormula(rawFormula);

	if (!formula) {
		return;
	}

	compEDFormulaLocker[typeTag] = rawFormula;
	jq('form').after('<div style="display:none;">{{' + typeTag + '}}</div>'); //an invisible element to force it to be evaluated
	edEntityLocker.comp[tag] = blocks.observable(function () {
		var newValue;
		try {
			newValue = eval(formula);
		} catch (err) {
			newValue = null;
		}
		qPP._setEDValue(typeTag, newValue);
		return newValue;
	});

};

qPP._recoverAllEDEntities = function () { //this is for non jfe mode runtime
	jq.each(qPP.edValueLocker, function (typeTag) {
		var type = qPP._getEDType(typeTag);
		if (type === 'atom') {
			qPP._entityfyRawEDValue(typeTag);
		} else if (type === 'comp') {
			qPP.setCompED(typeTag, compEDFormulaLocker[typeTag]);
		}

	});
};



qPP.registerImgs = function (q, edTag) {
	var urls;
	qPP.pageVisibleSgn.addOnce(function () {
		urls = qPP._obtainQImgUrls(q);
		for (var i = 0; i < urls.length; i++) {
			qPP.setAtomED(edTag + (i + 1), urls);
		}
	});
};

qPP._obtainQImgUrls = function (q) {
	var imgs = jq('#' + q.questionId)
		.find('.QuestionText').find('img');
	var urls = [];
	imgs.each(function () {
		urls.push(jq(this).attr('src'));
	});
	return urls;
};

qPP._imagesReadyHandler = function () {
	console.log('images loaded!')
};

qPP._internalPageReadyHandler = function () { //this is the internal page ready handler, user needs to define their own onPageReady handler
	qPP._entityfyAllRawEDValues();
	qPP.pageReadySgn.dispatch();
	qPP.buttonsReadySgn.dispatch();
	if (qPP.onPageReady) {
		qPP.onPageReady();
	}
	qPP._renderPage();
};

qPP._renderPage = function () {
	if (qPP.mdCnt > 0) {
		qPP._renderMD();
	} else {
		try {
			blocks.query(edEntityLocker);
		} catch (err) {
			console.error("blocks.query rendering failed");
		} finally {
			qPP._disableCopyPaste();
			if (qPP.engine.Page) {
				qPP.engine.Page.once("ready:imagesLoaded", qPP._imagesReadyHandler);
				qPP.engine.Page.setupImageLoadVerification();
			}
			qPP._makePageVisible();
		}
	}
};

qPP._makePageVisible = function () {
	jq('form').css('visibility', qPP.ogFormVisiblityStyle);
	qPP.pageVisibleSgn.dispatch();
};

qPP.addTextEntryHints = function (q) {
	if (qPP._getQuestionType(q) !== 'TE' || arguments.length < 2) {
		return;
	}
	var args = Array.prototype.slice.call(arguments);
	var jqEles = jq("#" + q.questionId).find('.InputText');
	jqEles.each(function (idx) {
		var hint;
		try {
			hint = args[idx + 1];
		} catch (err) {
			hint = '';
		}
		jq(this).attr("placeholder", hint);
	});
};


qPP.decorateTextEntry = function (q, pre, post, width) {
	if (!width) {
		width = 50;
	}
	if (qPP._getQuestionType(q) === 'TE' && qPP._getQuestionSelector(q) === 'SL') {
		jq("#" + q.questionId).find('.InputText')
			.css('display', 'inline')
			.before('<span>' + pre + "</span>")
			.after('<span>' + post + "</span>")
			.width(width + 'px');
	}
};

qPP.decorateMultipleChoice = function (q, pre, post) {
	if (qPP._getQuestionType(q) === 'MC') {
		var choiceTbl = jq("#" + q.questionId).find('.QuestionBody .ChoiceStructure tbody');
		var topRow = choiceTbl.find('tr').first();
		var lblRow = topRow.after("<tr>").next();
		topRow.find('td').each(function () {
			lblRow.append('<td>&mdash;</td>');
		});
		lblRow.find('td').first().text(pre);
		lblRow.find('td').last().text(post);
	}
};


qPP.hideButtons = function (time) { //time in seconds
	qPP.buttonsReadySgn.addOnce(function () {
		qPP.buttonsReadySgn.halt();
		qPP.buttonsReadySgn.forget();
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

qPP._renderMD = function () {
	var ele = jq('.ht-bt.mdMode').eq(--qPP.mdCnt);
	var txt = ele.text().replace(/^\s*/, "");
	marked(txt, {
		renderer: qPP.mdRenderer
	}, function (err, htmlCode) {
		ele.html(htmlCode);
		if (qPP.mdCnt > 0) {
			qPP._renderMD();
		} else {
			qPP._renderPage();
		}
	});
};

qPP._disableCopyPaste = function () {
	jq(document).on("cut copy paste", ".QuestionBody input:text, .QuestionBody textarea, .QuestionText", function (e) {
		e.stopPropagation();
		e.preventDefault();
	});
};

qPP._respToNumber = function (resp) {
	try {
		resp = resp.trim();
	} catch (err) {
		resp = null;
	}
	if (isNaN(resp) || resp === null) {
		return resp;
	} else {
		return Number(resp);
	}
};

qPP._getQuestionType = function (q) {
	var qInfo = q.getQuestionInfo();
	return qInfo.QuestionType;
};

qPP._getQuestionSelector = function (q) {
	var qInfo = q.getQuestionInfo();
	return qInfo.Selector;
};

qPP.obtainQResp = function (q) {
	var qInfo = q.getQuestionInfo();
	var qType = qPP._getQuestionType(q);
	var qSelector = qPP._getQuestionSelector(q);
	var choices = q.getChoices();
	var answers = q.getAnswers();

	var resp = '';

	switch (true) {
	case qType === 'MC':
		if (q.getSelectedChoices()[0]) {
			resp = qInfo.Choices[q.getSelectedChoices()[0]].Text;
			resp = qPP._respToNumber(resp);
			//resp=choices.indexOf(q.getChoiceValue())+1;
		} else {
			resp = "";
		}
		break;
	case qType === "TE" && qSelector !== "FORM":
		resp = q.getChoiceValue();
		resp = qPP._respToNumber(resp);
		break;
	case qType === "TE" && qSelector === "FORM":
		resp = jq.map(choices, function (val) {
			return qPP._respToNumber(q.getTextValue(val));
		});
		break;
	case qType === "Matrix":
		resp = jq.map(choices, function (val) {
			if (qInfo.Answers[q.getSelectedAnswerValue(val)]) {
				return qPP._respToNumber(qInfo.Answers[q.getSelectedAnswerValue(val)].Display);
			} else {
				return "";
			}
			//return answers.indexOf(q.getChoiceValue(val))+1
		});
		break;
	case qType === "Slider":
		resp = jq.map(choices, function (val) {
			return qPP._respToNumber(q.getChoiceValue(val));
		});
		break;
	}
	console.log('obtained response: ', resp);
	return resp;
};

qPP.createVideoPlayer = function (q, url, videoW, videoH, scaleFactor) {
	qPP._createMediaPlayer(q, 'video', url, videoW, videoH, scaleFactor);
};


qPP.createAudioPlayer = function (q, url) {
	qPP._createMediaPlayer(q, 'audio', url);
};

qPP._createMediaPlayerContainer = function (q) {
	var containerParent;
	if (!q.questionId) {
		containerParent = jq(' .QuestionText');
	} else {
		containerParent = jq("#" + q.questionId + ' .QuestionText');
	}
	containerParent.addClass('ht-bt').append('<div id="mediaPlayerContainer" class="center-block text-center"></div>');
};

qPP._createMediaPlayer = function (q, mediaType, fileUrl, fileW, fileH, scaleFactor) {
	qPP._createMediaPlayerContainer(q);

	var assetBaseUrl = "https://cdn.rawgit.com/lilchow/Qualtrics-plus-plus/master/commonAssets/";

	var mPlayerW = 400,
		mPlayerH = 50,
		mPlayerHPadding = 18;
	if (mediaType === 'video') { //this is for video player
		mPlayerW = scaleFactor * fileW;
		mPlayerH = scaleFactor * fileH;
	}

	var statusMsg;
	var statusMsgStyle = {
		font: Math.floor(mPlayerHPadding * 0.7) + 'px Arial',
		fill: '#bbb',
		align: 'center'
	};

	var bootState = {
		preload: function () {
			mPlayer.load.baseURL = assetBaseUrl;
			mPlayer.scale.pageAlignHorizontally = true;
			mPlayer.scale.refresh();
			mPlayer.load.image('progressBar', 'progressBar.png');
		},
		create: function () {
			mPlayer.stage.backgroundColor = "#333";
			mPlayer.state.start('load');
		}
	};

	var loadState = {
		preload: function () {
			mPlayer.add.text(mPlayer.world.centerX, mPlayer.world.centerY, ['loading', mediaType, '...'].join(' '), {
				font: '20px Arial',
				fill: '#ccc'
			}).anchor.setTo(0.5, 1);
			var progressBar = mPlayer.add.sprite(mPlayer.world.centerX, mPlayer.world.centerY, 'progressBar');
			progressBar.anchor.setTo(0.5, 0);
			mPlayer.load.setPreloadSprite(progressBar);
			mPlayer.load[mediaType](mediaType, fileUrl);
			mPlayer.load.spritesheet('ppBtn', 'playpause.jpg', 40, 40);
			mPlayer.load.image('volUBtn', 'volUBtn.jpg');
			mPlayer.load.image('volDBtn', 'volDBtn.jpg');
		},
		create: function () {
			mPlayer.state.start('play');
		}
	};

	var playState = {
		create: function () {

			statusMsg = mPlayer.add.text(mPlayer.world.centerX, mPlayerH, '', statusMsgStyle);
			statusMsg.anchor.setTo(0.5, 0);
			statusMsg.text = mediaType + ' ready and click PLAY to play';

			var volUBtn = mPlayer.add.button(mPlayer.world.width, mPlayer.world.height, 'volUBtn', this.incVol, this);
			volUBtn.anchor.setTo(1, 1);
			volUBtn.height = mPlayerHPadding;
			volUBtn.width = volUBtn.height * 0.75;

			var volDBtn = mPlayer.add.button(mPlayer.world.width, mPlayer.world.height, 'volDBtn', this.decVol, this);
			volDBtn.anchor.setTo(1, 1);
			volDBtn.height = mPlayerHPadding;
			volDBtn.width = volDBtn.height * 0.75;
			volDBtn.x = volDBtn.x - volUBtn.width;

			this.media = mPlayer.add[mediaType](mediaType);
			this.media.volume = 0.5;
			if (mediaType === 'video') {
				this.media.paused = true;
				this.media.onComplete.add(this.onMediaComplete, this);
				this.videoSprite = this.media.addToWorld(0, 0, 0, 0, scaleFactor, scaleFactor);
				this.addTogglePlayBtn();
			} else {
				this.audioSprite = mPlayer.add.text(mPlayer.world.centerX, mPlayer.world.centerY, "pre-processing audio", {
					font: '20px Arial',
					fill: '#ccc'
				});
				this.audioSprite.anchor.setTo(0.5, 0.5);
				statusMsg.text = '';
				this.media.onDecoded.addOnce(this.audioDecodedHandler, this);
				this.media.onStop.add(this.onMediaComplete, this);
			}

			mPlayer.onPause.add(this.pauseMedia, this);

		},
		update: function () {

		},
		audioDecodedHandler: function () {
			this.audioSprite.text = "ready";
			statusMsg.text = mediaType + ' ready and click PLAY to play';
			this.media.play();
			this.media.pause();
			this.addTogglePlayBtn();
		},
		addTogglePlayBtn: function () {
			this.ppBtn = mPlayer.add.button(0, mPlayer.world.height, 'ppBtn', this.togglePlay, this, 1, 1, 1, 1);
			this.ppBtn.anchor.setTo(0, 1);
			this.ppBtn.height = this.ppBtn.width = mPlayerHPadding;
		},
		togglePlay: function () {
			if (this.media.paused) {
				this.playMedia();
			} else {
				this.pauseMedia();
			}
		},
		playMedia: function () {
			statusMsg.text = mediaType + " playing";
			this.ppBtn.setFrames(0, 0, 0, 0);
			if (mediaType === 'video') {
				this.media.paused = false;
				this.media.play();
			} else {
				this.media.resume();
			}

		},
		pauseMedia: function () {
			statusMsg.text = mediaType + " paused";
			this.ppBtn.setFrames(1, 1, 1, 1);
			if (mediaType === 'video') {
				this.media.paused = true;
			} else {
				this.media.pause();
			}

		},
		incVol: function () {
			if (this.media.volume < 1) {
				this.media.volume += 0.1;
			}
		},

		decVol: function () {
			if (this.media.volume > 0) {
				this.media.volume -= 0.1;
			}
		},

		onMediaComplete: function () {
			mPlayer.onPause.removeAll(this);
			this.postCompleteProcessing();
		},

		postCompleteProcessing: function () {
			mPlayer.state.start('end');
		}

	};

	var endState = {
		create: function () {
			mPlayer.add.text(mPlayer.world.centerX, mPlayer.world.centerY, 'The End', {
				font: '24px Arial',
				fill: '#fff'
			}).anchor.setTo(0.5, 0.5);
			jq('#Buttons').show();
		}
	};
	console.log(mPlayerW, mPlayerH);
	var mPlayer = new Phaser.Game(mPlayerW, mPlayerH + mPlayerHPadding, Phaser.CANVAS, 'mediaPlayerContainer');
	mPlayer.state.add('boot', bootState);
	mPlayer.state.add('load', loadState);
	mPlayer.state.add('play', playState);
	mPlayer.state.add('end', endState);
	mPlayer.state.start('boot');
	console.log('try playing ' + mediaType);
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
	var chosenMarkerSet = qPP._shuffleArray(markerSet).slice(0, length);
	var usedMarkerSet = [];
	var correctAnswer = Number(chosenMarkerSet.join('')); //this is the answer participant should type in

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
			var entry = qPP.obtainQResp(q);
			if (!entry) {
				return;
			} else if (entry === correctAnswer) {
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
			console.log('all digits played and the answer is: ', correctAnswer);
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

qPP.createImageGrid = function (q, nCol, rowHeight, imgArray, baseUrl) {
	if (!Array.isArray(imgArray) || [1, 2, 3, 4].indexOf(nCol) < 0) {
		return;
	}

	if (!baseUrl) {
		baseUrl = '';
	}
	imgArray = jq.map(imgArray, function (val) {
		return baseUrl + val;
	});


	var totalImgCnt = imgArray.length;
	var nRow = Math.ceil(totalImgCnt / nCol);
	var lastRowNCol = totalImgCnt % nCol === 0 ? nCol : totalImgCnt % nCol;

	var gridContainer;
	if (!q.questionId) {
		gridContainer = jq('.QuestionText');
	} else {
		gridContainer = jq("#" + q.questionId + ' .QuestionText');
	}
	gridContainer.addClass('ht-bt').append('<div class="well">');
	gridContainer = gridContainer.find('.well');

	for (var i = 0; i < nRow; i++) {
		gridContainer.append(jq('<div class="row">'));
	}


	gridContainer.find('.row').each(function (idx) {
		var nthRow = idx + 1;
		for (var i = 0; i < (nthRow < nRow ? nCol : lastRowNCol); i++) {
			var thumbnailWrapper = jq('<div class="col-xs-' + (12 / nCol) + '">').append(
				jq('<div class="thumbnail">')
				.append('<div class="grid-img">')
				.append('<div class="caption">')
			);
			jq(this).append(thumbnailWrapper);
		}
	});

	gridContainer.find('.thumbnail .grid-img').each(function (idx) {
		jq(this).css({
			height: rowHeight + 'px',
			"background-image": 'url(' + imgArray[idx] + ')',
			"background-repeat": "no-repeat",
			"background-size": "contain",
			"background-position": "center"

		});
	});
};
//carousel related items
qPP.__carouselItems = [];
qPP.__carouselHeight = null;

qPP.setAsCarouselItem = function (q) {
	if (q.getQuestionInfo().QuestionType !== 'DB') { //only text/graphic question can be slide
		return;
	}
	var qId = '#' + q.questionId;
	qPP.__carouselItems.push(qId);
	if (!qPP.__carouselHeight) {
		qPP.__carouselHeight = jq(qId).height();
	} else {
		qPP.__carouselHeight = qPP.__carouselHeight >= jq(qId).height() ? qPP.__carouselHeight : jq(qId).height();
	}
};

qPP.__carouselOptions = {
	$AutoPlay: false,
	$BulletNavigatorOptions: {
		$Class: $JssorBulletNavigator$,
		$ChanceToShow: 2,
		$AutoCenter: 1,
		$SpacingX: 10,
		$ActionMode: 0 //you cannot click on bullet
	},
	$ArrowNavigatorOptions: {
		$Class: $JssorArrowNavigator$,
		$ChanceToShow: 2,
		$AutoCenter: 2,
	}
};

qPP.createCarousel = function (q) {
	qPP.hideButtons();
	qPP.carouselQuestionId = '#' + q.questionId;
	qPP.carouselWidth = jq(qPP.carouselQuestionId + ' .QuestionText').width();

	qPP._makeCarouselContainer()
		.append(qPP._fillCarouselItemContainer())
		.append(qPP._makeCarouselBullets())
		.append(jq('<span u="arrowleft" class="jssora10l" style= "left: 5px;" >'))
		.append(jq('<span u="arrowright" class="jssora10r" style= "right: 5px;">'));

	qPP.carousel = new $JssorSlider$('carouselContainer', qPP.__carouselOptions);
	qPP.carousel.$On($JssorSlider$.$EVT_PARK, function (slideIndex) {
		if (slideIndex + 1 === qPP.__carouselItems.length) {
			console.log('carousel ended');
			jq('#Buttons').show();
		}
	});
};

qPP._makeCarouselContainer = function () { //screen is jssor outer container
	jq(qPP.carouselQuestionId + ' .QuestionText').addClass('ht-bt')
		.append('<div id="carouselContainer" style="position: relative; top: 0px; left: 0px; width: ' + qPP.carouselWidth + 'px; height: ' + qPP.__carouselHeight + 'px;">');

	return jq('#carouselContainer');
};

qPP._fillCarouselItemContainer = function () {
	var carouselItemContainer = jq('<div u="slides" style="position: absolute; overflow: hidden; left: 0px; top: 0px; width: ' + qPP.carouselWidth + 'px; height: ' + qPP.__carouselHeight + 'px;">');

	jq.each(qPP.__carouselItems, function (idx, val) {
		var slideHtml = jq(val + ' .QuestionText').html();
		var slideWrap = jq('<div>').append(
			jq('<div style="height: ' + qPP.__carouselHeight + 'px;">').append(jq('<div style="display: block; position: relative; top: 50%; transform: translateY(-50%);">').html(slideHtml))
		);
		carouselItemContainer.append(slideWrap);
		jq(val).hide().next().hide();
	});
	return carouselItemContainer;
};

qPP._makeCarouselBullets = function () {
	return jq('<div u="navigator" class="jssorb14" style="bottom: 10px;">').append('<div u="prototype">');
};

//utility helper function
qPP._shuffleArray = function (array) {
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
	qPP.windowLoadedSgn.add(qPP._internalPageReadyHandler);
	qPP.windowLoadedSgn.add(qPP._recoverAllEDEntities, null, 4);
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
	qPP.engine.Page.once('ready', qPP._internalPageReadyHandler);
}

if (!qPP.engine.Page) { //this is for preview purpose
	qPP.engine.addOnUnload(function () {
		sessionStorage.previewEDValueLocker = JSON.stringify(previewEDValueLocker);
		sessionStorage.compEDFormulaLocker = JSON.stringify(compEDFormulaLocker);
		sessionStorage.iVars = JSON.stringify(iVars);
	});
}

jq(window).load(function () {
	qPP.windowLoadedSgn.dispatch();
});