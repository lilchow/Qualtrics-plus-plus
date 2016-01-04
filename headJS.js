var jq = $.noConflict();
var ld = _.noConflict();

var qPP = {
	VM: null,
	engine: Qualtrics.SurveyEngine,
	Signal: signals.Signal
};

var nonPageRuntimeED, vmSource, arbor; //the first two are only needed for non jfe mode
if (!qPP.engine.Page) {
	if (!sessionStorage.nonPageRuntimeED) {
		nonPageRuntimeED = {};
		arbor = {};
	} else {
		nonPageRuntimeED = JSON.parse(sessionStorage.nonPageRuntimeED);
		arbor = JSON.parse(sessionStorage.arbor);
	}
	qPP.edSnapshotLocker = nonPageRuntimeED;
} else {
	arbor = arbor || {};
	qPP.edSnapshotLocker = qPP.engine.Page.runtime.ED;
}

qPP._isComputedED = function (typeTag) {
	return /^comp[A-Z]\w*$/.test(typeTag);
};

vmSource = {
	data: ld.omit(ld.cloneDeep(qPP.edSnapshotLocker),
		function (val, key) {
			return qPP._isComputedED(key);
		}),
	computed: {},
	ready: function () {
		console.log('vm ready!');
		jq('body').css('visibility', 'visible');
	}
};

qPP.getED = function (typeTag) {
	return qPP.VM ? qPP.VM.$get(typeTag) : qPP.edSnapshotLocker[typeTag];
};

qPP.addED = function (edTag, edVal) {
	if (!qPP._isComputedED(edTag) && ld.isUndefined(qPP.getED(edTag))) {
		qPP.setED(edTag, edVal);
	}
};

qPP.setED = function (edTag, edVal) {
	if (qPP._isComputedED(edTag)) {
		return;
	}
	qPP.edSnapshotLocker[edTag] = edVal;
	if (!qPP.VM) {
		vmSource.data[edTag] = edVal;
	} else {
		qPP.VM.$set(edTag, edVal);
	}
};

qPP.saveRespAsED = function (q, typeTag) {
	var qId = "#" + q.questionId;
	qPP.addED(typeTag, '');
	jq(qId).mouseleave(function () {
		var resp = qPP.obtainResp(q);
		if (resp === null) {
			return;
		}
		qPP.setED(typeTag, resp);
	});
};

qPP._convertFormulaToCompED = function (formula, edTag) {
	vmSource.computed[edTag] = function () {
		var val = eval(formula);
		qPP.edSnapshotLocker[edTag] = val;
		return val;
	}
};

qPP._parseUserFormula = function (formula) {
	var regPattern = /{{[a-zA-Z]\w*}}/g;
	var dependencyArray = formula.match(regPattern);
	if (!dependencyArray) { //does not match anaything
		return null;
	}

	if (ld.any(dependencyArray, function (tag) {
			tag = tag.replace(/[{}]/g, '');
			ld.isUndefined(qPP.getED(tag));
		})) { //some dependency is not defined
		return null;
	}

	formula = formula.replace(regPattern, function (allMatch, typeTag) {
		return 'this.' + typeTag;
	});
	console.log('parsed formula: ', formula);
	return formula;
};

qPP.setCompED = function (typeTag, userFormula) {
	if (!qPP._isComputedED(typeTag)) {
		return;
	}

	var formula = qPP._parseUserFormula(userFormula);
	if (formula === null) {
		return;
	}
	qPP.edSnapshotLocker.formulae[typeTag] = formula;
	vmSource.data.formulae[typeTag] = formula;
};

qPP._constructPageVM = function () { //this is the internal page ready handler, user needs to define their own onPageReady handler
	console.log('construct vm');
	//convert all existing formulae To compEDs 
	ld.forEach(vmSource.data.formulae, qPP._convertFormulaToCompED);
	qPP.VM = new Vue(vmSource);
	qPP.VM.$mount(jq('form').get(0));
};


qPP.createValueTree = function () { //for creating json obj
	var args = Array.prototype.slice.call(arguments);
	if (args.length < 3) {
		return null;
	}
	var rootname = args.shift();
	var values = args.pop();
	//	ars only contain nodes
	if (typeof rootname !== 'string' || !Array.isArray(values)) {
		return null;
	}
	var expectedValueCnt = args.reduce(function (preVal, curVal) {
		return preVal * curVal.length;
	}, 1);

	if (expectedValueCnt !== values.length) {
		return null;
	}

	function traverseTree(currentLevel, contextObj) {
		if (currentLevel < args.length) {
			args[currentLevel - 1].forEach(function (ele) {
				this[ele] = {};
				traverseTree(currentLevel + 1, this[ele]);
			}, contextObj);
		} else {
			args[currentLevel - 1].forEach(function (ele) {
				this[ele] = values.shift();
			}, contextObj);
		}
	}
	arbor[rootname] = {};
	traverseTree(1, arbor[rootname]);
};

//this is for pkcing alternative texts directly typed in the question-text in gui
qPP.pickAlternativeText = function (q, index) {
	var hostQElm = jq('#' + q.questionId);
	var qText = hostQElm.find('.QuestionText')[0];
	var rng = bililiteRange(qText).bounds('all');
	var tgtRngMarker = /<#<(.+?)>#>/gi;
	var alternatives,pickedAlternative;
	for (rng.find(tgtRngMarker); rng.match; rng.find(tgtRngMarker)) {
		alternatives = rng.match[1];
		pickedAlternative = alternatives.split('<>')[index];
		rng.text(pickedAlternative, 'end');
	}
};

//Form controls modifications:
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

qPP.addWordCounter = function (q) {
	var hostQElm = jq('#' + q.questionId);
	qPP.setED('wordCnt', '0');
	var qBody = hostQElm.find('.QuestionBody').addClass('ht-bt');
	var counter = jq("<div/>")
		.insertAfter(qBody.find('.ChoiceStructure'))
		.text('current word count: {{wordCnt}}')
		.addClass("alert alert-info");

	qBody.find('textarea')
		.change(countWord)
		.keyup(countWord);

	function countWord() {
		var enteredTxt = qBody.find('textarea').val();
		if (enteredTxt.length === 0) {
			qPP.setED('wordCnt', '0');
		} else {
			var wordCount = enteredTxt.trim().replace(/\s+/gi, ' ').split(' ').length;
			qPP.setED('wordCnt', String(wordCount));
		}
	}
};

qPP.setMinWordCnt = function (q, min) {
	qPP.addWordCounter(q);
	var hostQElm = jq('#' + q.questionId);
	var qBody = hostQElm.find('.QuestionBody');
	var alert = jq('<div class="alert alert-danger" style="display:none">your passage does NOT have enough words</div>')
		.insertAfter(qBody.find('.ChoiceStructure'));
	qPP.modButtons(checkCurrentWordCnt);

	function checkCurrentWordCnt() {
		var cnt = parseInt(qPP.getED('wordCnt'));
		if (cnt >= min) {
			qPP.deModButtons();
			jq('#Buttons').click();
		} else {
			alert.show();
			setTimeout(function () {
				alert.hide();
			}, 1500);
		}
	}
};

qPP.setTextareaRules = function (q, min, forbiddenLetters) {
	qPP.addWordCounter(q);
	var hostQElm = jq('#' + q.questionId);
	var qBody = hostQElm.find('.QuestionBody');
	var alert1 = jq('<div class="alert alert-danger" style="display:none">your passage does NOT have enough words</div>')
		.insertAfter(qBody.find('.ChoiceStructure'));
	var alert2 = jq('<div class="alert alert-danger" style="display:none">your passage contains forbidden letters</div>')
		.insertAfter(qBody.find('.ChoiceStructure'));
	qPP.modButtons(checkRules);

	function checkCurrentWordCnt() {
		var cnt = parseInt(qPP.getED('wordCnt'));
		if (cnt < min) {
			alert1.show();
			setTimeout(function () {
				alert1.hide();
			}, 1500);
		}
		return (cnt >= min);
	}

	function checkForbiddenLetters() {
		var enteredTxt = qBody.find('textarea').val();
		var cnt = ld.intersection(forbiddenLetters, enteredTxt).length;
		if (cnt > 0) {
			alert2.show();
			setTimeout(function () {
				alert2.hide();
			}, 1500);
		}
		return (cnt <= 0);
	}

	function checkRules() {
		if (checkCurrentWordCnt() && checkForbiddenLetters()) {
			qPP.deModButtons();
			jq('#Buttons').click();
		}
	}
};

qPP.createBipolarLikert = function (q, min) { //only minimal value is needed, turn bipolar question into decent liker
	var queBody = jq('#' + q.questionId).find('.QuestionBody').addClass('ht-bt');
	var radios = queBody.find('.ChoiceRow td.c4');
	radios.wrapInner('<label class="btn btn-default">');
	radios = queBody.find('input:radio');
	if (min) {
		jq.each(radios, function (idx) {
			jq(this).after(min + idx).hide();
		});
	}
	var tableRow = queBody.find('.ChoiceRow');
	var btnGrp = jq('<td class="btn-group btn-group-justified">')
		.append(queBody.find('label.btn'));
	var left = jq('<td style="width:18%">').html('<span class="badge">' + tableRow.find('.AnswerLeft').text() + '</span>');
	var right = jq('<td style="width:18%">').html('<span class="badge">' + tableRow.find('.AnswerRight').text() + '</span>');
	tableRow.empty().append(left).append(btnGrp).append(right);
	tableRow.on('click', 'label.btn', function () {
		tableRow.find('label.btn').removeClass('active');
		jq(this).addClass('active');
	});
};

qPP.createSlider = function (q, minLbl, maxLbl, min, max, val, width, keepStatements) {
	if (qPP._getQuestionType(q) === 'TE') {
		if (!width) {
			width = 300;
		}
		var statements = [];
		var hostQElm = jq("#" + q.questionId);
		hostQElm.find('.ChoiceStructure tbody tr')
			.find('td:first')
			.each(function () {
				statements.push(jq(this).text());
				jq(this).remove();
			});

		if (keepStatements) {
			hostQElm.find('.ChoiceStructure tbody tr').each(function (idx) {
				jq('<tr>').append(jq('<td>').text(statements[idx]))
					.insertBefore(jq(this));
				jq(this).after('<hr>');
			});

		}

		hostQElm.find('.ChoiceStructure').addClass('ht-bt')
			.find('input.InputText')
			.css('display', 'inline')
			.before('<label>' + minLbl + "</label>")
			.after('<label>' + maxLbl + "</label>")
			.width(width + 'px')
			.attr('min', min).attr('max', max).attr('value', val)
			.attr('type', 'range');
	}
};

qPP.createRangeSlider = function (q, minLbl, maxLbl, min, max, defaultMin, defaultMax, width) {
	if (!width) {
		width = 450;
	}
	var input = jq("#" + q.questionId)
		.find('.ChoiceStructure').addClass('ht-bt')
		.find('input.InputText')
		.css('display', 'inline');
	input.wrapAll('<div class="well" style="background-color:#cfcfcf !important"/>');
	input.before('<label style="padding-right:12px !important">' + minLbl + "</label>")
		.after('<label style="padding-left:12px !important">' + maxLbl + "</label>")
		.width(width + 'px');

	input.slider({
		min: min,
		max: max,
		step: 1,
		value: [defaultMin, defaultMax],
		tooltip: 'show',
		tooltip_split: true
	});

	jq(input.slider('getElement'))
		.find('.slider-track .slider-selection')
		.css({
			background: '#ADCAE2'
		});
};

qPP.modButtons = function (newFunction) {
	qPP.buttonsReadySgn.addOnce(function () {
		function enhancedNewFunction(evt) {
			evt.stopPropagation();
			evt.preventDefault();
			newFunction();
		}
		jq('#Buttons')[0].modFunction = enhancedNewFunction;
		jq('#Buttons')[0].addEventListener("click", jq('#Buttons')[0].modFunction, true);
	});
};

qPP.deModButtons = function () {
	if (jq('#Buttons')[0].modFunction) {
		jq('#Buttons').get(0).removeEventListener("click", jq('#Buttons')[0].modFunction, true);
	}

};

qPP.showButtons = function () {
	jq('#Buttons').show();
};

qPP.hideButtons = function (time) { //time in seconds
	qPP.buttonsReadySgn.addOnce(function () {
		//qPP.buttonsReadySgn.halt();
		//qPP.buttonsReadySgn.forget();
		jq('#Buttons').hide();
		if (!time) {
			return;
		}
		setTimeout(qPP.showButtons, time * 1000);
	});
};

qPP.disableCopyPaste = function (q) {
	jq("#" + q.questionId).on("cut copy paste", ".QuestionBody input:text, .QuestionBody textarea, .QuestionText", function (e) {
		e.stopPropagation();
		e.preventDefault();
	});
};

qPP.setTextEntryValue = function (textEntry, content) { //textfield is pure dom element
	bililiteRange(textEntry).text(content);
};


//Form content modifications

qPP.removeQuestionText = function (q) {
	var hostQElm = jq('#' + q.questionId);
	hostQElm.find('.QuestionText').hide();
};

qPP.removeQuestionBody = function (q) {
	var hostQElm = jq('#' + q.questionId);
	hostQElm.find('.QuestionBody').hide();
};

qPP.removeEntireQuestion = function (q) {
	var hostQElm = jq('#' + q.questionId);
	hostQElm.hide();
};

qPP.collapseQuestionBorder = function (q, whichSide) {
	if (q.getQuestionInfo().QuestionType === 'DB') { //text/graphic question can be slide
		qPP.removeQuestionBody(q);
	}
	var hostQElm = jq('#' + q.questionId);
	var collapseUp = {
		'margin-top': 0,
		'padding-top': 0
	};
	var collapseDown = {
		'margin-bottom': 0,
		'padding-bottom': 0
	};
	switch (true) {
	case whichSide === 'up' || whichSide === 'both':
		hostQElm.prev('.Separator').hide();
		hostQElm.find('.Inner').css(collapseUp);
		if (jq('.QuestionText', hostQElm).is(':visible')) {
			jq('.QuestionText', hostQElm).css(collapseUp);
		} else {
			jq('.QuestionBody', hostQElm).css(collapseUp);
		}
		if (whichSide === 'up') {
			break;
		}
	case whichSide === 'down':
		hostQElm.next('.Separator').hide();
		hostQElm.find('.Inner').css(collapseDown);
		if (jq('.QuestionBody', hostQElm).is(':visible')) {
			jq('.QuestionBody', hostQElm).css(collapseDown);
		} else {
			jq('.QuestionText', hostQElm).css(collapseDown);
		}
	}
};

qPP.enableMarkdown = (function () {
	//customize marked.js markdown renderer options
	var alignMap = {
		l: 'left',
		r: 'right',
		c: 'center'
	};
	var qPPRenderer = new marked.Renderer();
	qPPRenderer.heading = function (text, level) {
		var arr = text.split('::');
		console.log(arr);
		var alignment = 'l';
		if (arr.length === 2) {
			alignment = arr.pop();
		}
		return vsprintf('<h%1$s style="text-align:%2$s">%3$s</h%1$s>', [level, alignMap[alignment], arr[0]]);
	};

	qPPRenderer.image = function (name, title, text) { //name can be url or atlas key
		var arr = text.split(/::/);
		arr.unshift(name);
		arr[3] = arr[3] ? arr[3] : 'c';
		arr[4] = alignMap[arr[3]];
		return vsprintf('<qppimg>{{{%1$s | imagify %2$s %3$s "%4$s"}}}</qppimg>', arr);
	};

	qPPRenderer.del = function (text) {
		return '<u>' + text + '</u>';
	};
	qPPRenderer.codespan = function (text) {
		var arr = text.split('::');
		var color = 'yellow';
		if (arr.length === 2) {
			color = arr.pop();
		};
		return '<span style="background-color:' + color + '">' + arr.pop() + '</span>';
	};
	return function (q) {
		var ele = jq('#' + q.questionId)
			.find('.QuestionText').addClass('ht-bt mdMode');
		var mdTxt = ele.text().replace(/^\s*/, "");
		ele.html(marked(mdTxt, {
			renderer: qPPRenderer
		}));
	}
})();

//creating image grid
qPP.createImageGrid = function (q, nCol, imgHeight, imgArray) {
	if (!Array.isArray(imgArray) || nCol > 4 || nCol <= 0) {
		return;
	}

	var hostQ = q.questionId ? jq("#" + q.questionId) : jq(document);
	var gridContainer = jq('.QuestionText', hostQ)
		.addClass('ht-bt').append('<div class="well">');
	gridContainer = gridContainer.find('.well');

	var totalImgCnt = imgArray.length;
	var nRow = Math.ceil(totalImgCnt / nCol);
	var lastRowNCol = totalImgCnt % nCol === 0 ? nCol : totalImgCnt % nCol;
	for (var i = 0; i < nRow; i++) {
		gridContainer.append(jq('<div class="row">'));
	}

	gridContainer.find('.row').each(function (idx) {
		var nthRow = idx + 1;
		for (var i = 0; i < (nthRow < nRow ? nCol : lastRowNCol); i++) {
			var thumbnailWrapper = jq('<div class="col-xs-' + (12 / nCol) + '">').append(
				jq('<div class="thumbnail">')
				.append('<div class="grid-img-wrapper" style="height:' + imgHeight + 'px">')
			);
			jq(this).append(thumbnailWrapper);
		}
	});


	gridContainer.find('.thumbnail .grid-img-wrapper').each(function (idx) {
		jq(this).html(sprintf(
			'{{{"%1$s" | imagify "%2$s" %3$s "c"}}}', imgArray[idx], jq(this).width(), imgHeight));
	});
};

// creating carousel-type slideshow with multiple questions
qPP.setAsSlide = function (q) {
	if (q.getQuestionInfo().QuestionType !== 'DB') { //only text/graphic question can be slide
		return;
	}
	qPP.createSlideshow.__slides.push(jq('#' + q.questionId).find('.QuestionText'));
	qPP.createSlideshow.__slideIds.push('#' + q.questionId);
};

qPP.createSlideshow = function slideshow(q) {
	qPP.hideButtons();
	jq('.Separator').hide();
	jq('#' + q.questionId).find('.QuestionText').append('<div class="slideshow">slideshow here</div>');
	slideshow.__wrapper = jq('#' + q.questionId).find('.QuestionText div.slideshow');
	slideshow.__width = slideshow.__wrapper.width();
	slideshow.__height = ld(slideshow.__slides)
		.map(function (slide) {
			return slide.height();
		}).max();
	slideshow.__wrapper.addClass('flexslider')
		.html('')
		.css({
			position: 'relative',
			top: 0,
			left: 0
		});
	addSlidesToSlideshow();
	slideshow.__main = slideshow.__wrapper.bxSlider({
		infiniteLoop: false,
		hideControlOnEnd: true,
		pagerType: 'short',
		onSlideAfter: function (slide, prevIdx, currentIdx) {
			if (currentIdx + 1 === slideshow.__main.getSlideCount()) {
				console.log('slideshow ended');
				qPP.showButtons();
			}
		}
	});

	function addSlidesToSlideshow() {
		ld.forEach(slideshow.__slides,
			function (slide, idx) {
				var slideWrapper = jq('<div class="ht-bt" style="position: absolute; left: 0px; top: 0px; margin:0px !important;padding:0px !important; width: ' + slideshow.__width + 'px; height: ' + slideshow.__height + 'px;">');
				slideWrapper.html(slide.html());
				slideshow.__wrapper.append(slideWrapper);
				jq(slideshow.__slideIds[idx]).hide();
			});
	}
};
qPP.createSlideshow.__slides = [];
qPP.createSlideshow.__slideIds = [];
qPP.createSlideshow.__main = null;

//video audio related
qPP.createSoundChecker = function (q) {
	qPP.hideButtons();
	var hostQ = q.questionId ? jq("#" + q.questionId) : jq(document);
	var mp3Url = 'https://cdn.rawgit.com/lilchow/Qualtrics-plus-plus/master/commonAssets/digits/digits.mp3';
	var digitSet = ld.range(1, 9);
	var digitDurations = [574, 679, 679, 679, 626, 783, 731, 496];
	var startPoint = 0,
		digitOnsetPoints = [0];
	ld.forEach(digitDurations, function (duration) {
		startPoint += duration;
		digitOnsetPoints.push(startPoint);
	});
	var chosenDigitSet = ld.shuffle(digitSet).slice(0, 5);
	var correctAnswer = Number(chosenDigitSet.join(''));
	var digitCounter = 0;
	var soundInstance;
	var checkerContainer = jq(' .QuestionText', hostQ);
	checkerContainer.addClass('ht-bt')
		.append('<div class="audioChecker well center-block text-center" style="width:250px;"></div>')
		.append('<div class="alert alert-danger">Code incorrect. Try again.</div>');

	var audioChecker = jq('.audioChecker', checkerContainer);
	var playBtn = jq('<button type="button" class="btn btn-primary btn-block" disabled>PLAY</button>');
	var checkBtn = jq('<button type="button" class="btn btn-warning btn-block" disabled>CHECK</button>');
	audioChecker.append(playBtn).append(checkBtn);
	var alert = jq('.alert-danger', checkerContainer).hide();

	var loadQueue = new createjs.LoadQueue();
	loadQueue.installPlugin(createjs.Sound);
	loadQueue.addEventListener("complete", initiateChecker);
	loadQueue.loadFile({
		src: mp3Url,
		type: createjs.AbstractLoader.SOUND
	});

	function playSingleDigit() {
		if (digitCounter >= chosenDigitSet.length) {
			digitCounter = 0;
			playBtn.prop('disabled', false);
			return;
		}
		var whichDigit = chosenDigitSet[digitCounter];
		soundInstance = createjs.Sound.createInstance(mp3Url, digitOnsetPoints[whichDigit - 1], digitDurations[whichDigit - 1]);
		soundInstance.addEventListener("complete", function () {
			if (soundInstance) {
				soundInstance.destroy();
			}
			++digitCounter;
			playSingleDigit();
		});
		soundInstance.play();
	};


	function initiateChecker() {
		playBtn.prop('disabled', false);
		checkBtn.prop('disabled', false);
		playBtn.on('click', function (evt) {
			evt.stopPropagation();
			evt.preventDefault();
			jq(this).prop('disabled', true);
			playSingleDigit();
		});
		checkBtn.on('click', function (evt) {
			evt.stopPropagation();
			evt.preventDefault();
			checkAnswer();
		})
	}

	function checkAnswer() {
		var entry = qPP.obtainResp(q);
		if (!entry) {
			return;
		} else if (entry === correctAnswer) {
			alert.hide();
			playBtn.off();
			checkBtn.off();
			qPP.showButtons();
		} else {
			ld.delay(function () {
				alert.hide()
			}, 1500);
			alert.show();
		}
	}
};


qPP._createMediaPlayer = function (q, mediaType, url, width, autoplay, playbackRate) {
	var currentMediaPlayer = {
		main: null,
		container: null,
		readySgn: new qPP.Signal()
	};
	currentMediaPlayer.readySgn.memorize = true;
	var hostQElm = q.questionId ? jq("#" + q.questionId) : jq(document);
	playbackRate = ld.isUndefined(playbackRate) ? 1 : playbackRate;
	autoplay = ld.isUndefined(autoplay) ? false : autoplay;
	var mediaTag;
	if (mediaType === 'video') {
		mediaType = 'video/mp4';
		mediaTag = 'video';
	} else {
		mediaType = 'audio/mp3';
		mediaTag = 'audio';
	}
	qPP._downloadMedia(q, url, qPP._displayDownloadProgressBar, setupMediaPlayer, qPP._alertDownloadFailure);
	return currentMediaPlayer;

	function setupMediaPlayer(blob_url) {
		if (hostQElm[0].pbContainer) {
			hostQElm[0].pbContainer.remove();
			hostQElm[0].pbContainer = null;
		}

		mediaTag = jq('<' + mediaTag + ' class="video-js vjs-default-skin vjs-big-play-centered">')
			.append(
				jq('<source type="' + mediaType + '"/>').attr('src', blob_url)
			);
		jq('.QuestionText', hostQElm).append(mediaTag);
		var mediaPlayerOptions = {
			width: width,
			autoplay: autoplay,
			posterImage: false,
			loadingSpinner: false,
			controls: true,
			controlBar: false
				/*{
								fullscreenToggle: false,
								muteToggle: false,
								remainingTimeDisplay: true,
								progressControl: {
									seekBar: false
								}
							}*/
		};
		if (ld.startsWith(mediaType, 'audio')) {
			mediaPlayerOptions.height = 100;
		}
		var playerContainer, mediaPlayer, bigButton;

		mediaPlayer = videojs(mediaTag[0], mediaPlayerOptions, function () {
			console.log('videojs setup completed!');
			mediaPlayer.playbackRate(playbackRate);
			playerContainer = jq(mediaPlayer.contentEl()).css('margin', 'auto');
			jq(document).on('visibilitychange', function () { //see if the browser tab is in focus or not
				if (this['hidden']) {
					mediaPlayer.pause();
				}
			});
			bigButton = jq(mediaPlayer.bigPlayButton.contentEl());
			mediaPlayer.on('ended', function () {
				jq(document).off('visibilitychange');
				console.log('media playback completed!');
				qPP.showButtons();
			});
			mediaPlayer.on('pause', function () {
				bigButton.show();
				mediaPlayer.one('play', function () {
					bigButton.hide();
				});
			});
			currentMediaPlayer.main = mediaPlayer;
			currentMediaPlayer.container = playerContainer;
			currentMediaPlayer.readySgn.dispatch();
		});
	}
};

qPP.createVideoPlayer = function (q, url, width, autoplay, playbackRate) {
	return qPP._createMediaPlayer(q, 'video', url, width, autoplay, playbackRate);
};

qPP._downloadMedia = function (q, url, progressHandler, completeHandler, errorHandler) {
	qPP.hideButtons();
	var hostQElm = q.questionId ? jq("#" + q.questionId) : jq(document);
	var xhr = new XMLHttpRequest(),
		progressPercentage = 0;
	xhr.open("GET", url, true);
	xhr.responseType = "blob";

	xhr.addEventListener("load", function () {
		if (xhr.status === 200) {
			var URL = window.URL || window.webkitURL;
			var blob_url = URL.createObjectURL(xhr.response);
			completeHandler(blob_url);
		} else {
			errorHandler();
		}
	}, false);

	xhr.addEventListener("progress", function (event) {
		if (event.lengthComputable) {
			var percentage = Math.round((event.loaded / event.total) * 100);
			if (percentage !== progressPercentage) {
				progressPercentage = percentage;
				progressHandler(percentage, hostQElm);
			}
		}
	});
	xhr.send();
};

qPP._alertDownloadFailure = function () {
	alert('download failed!');
};

//Form response processing
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

qPP.obtainResp = function (q) {
	var hostQ = q.questionId ? jq("#" + q.questionId) : jq(document);
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
		resp = jq('input:text', hostQ).val();
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

qPP._setVMConstructPrereq = (function () {
	var prereqs = {
		pageReady: false
	};
	return function (prereqName, value) {
		ld.set(prereqs, prereqName, value);
		if (value && ld.every(prereqs, Boolean)) {
			qPP._constructPageVM();
		}
	};
})();

//add Vue.js components
qPP.importImageAtlas = function (q, picLink, jsonLink) {
	qPP.hideButtons();
	var hostQElm = q.questionId ? jq("#" + q.questionId) : jq(document);
	qPP.edSnapshotLocker.textureAtlas = {};
	var loadQueue = new createjs.LoadQueue();
	loadQueue.addEventListener("complete", handlePreloadComplete);
	loadQueue.addEventListener("progress", handlePreloadProgress);
	loadQueue.loadFile({
		id: "atlasImg",
		src: picLink
	});
	loadQueue.loadFile({
		id: "atlasHash",
		src: jsonLink
	});

	function handlePreloadComplete(evt) {
		var json = evt.target.getResult('atlasHash');
		var blobSrc = evt.target.getResult('atlasImg').src;
		processJson(json, blobSrc);
	}

	function handlePreloadProgress(evt) {
		qPP._displayDownloadProgressBar(evt.progress * 100, hostQElm);
	}

	function processJson(json, blobSrc) {
		hostQElm[0].pbContainer.remove();
		hostQElm[0].pbContainer = null;
		qPP.edSnapshotLocker.textureAtlas.url = blobSrc;
		qPP.edSnapshotLocker.textureAtlas.height = json.meta.size.h;
		qPP.edSnapshotLocker.textureAtlas.width = json.meta.size.w;
		qPP.edSnapshotLocker.textureAtlas.frames = ld(json.frames)
			.mapKeys(function (value, key) {
				return key.replace(/[.]jp[e]?g|[.]png|[.]bmp$/i, '');
			}).mapValues('frame').value();
		qPP.showButtons();
	}
};


qPP._displayDownloadProgressBar = function (percentage, hostQElm) {
	console.log('progress: ', percentage);
	jq('#Buttons').hide();
	if (!hostQElm[0].pbContainer) {
		hostQElm[0].pbContainer = jq('<div class="ht-bt">').appendTo(jq('.QuestionText', hostQElm));
		hostQElm[0].pbContainer.html('<div class="form-group"></div>');
		jq('.form-group', hostQElm[0].pbContainer)
			.append('<label>downloading file:</label>')
			.append('<div class="progress"><div class="progress-bar" style="width: 0%;"></div></div>');
	} else {
		jq('.progress-bar', hostQElm[0].pbContainer).css('width', percentage + '%');
	}

};
//register Vue customize components and filters


if (!Vue.filter('imagify')) {
	Vue.filter('imagify', function (name, canvasW, canvasH, align) { //name is either hashkey for atlas image or url link for url image
		var imgType = /^http[s]*:\/\//.test(name) ? 'url' : 'atlas';
		var alignMap = {
			l: 'left',
			r: 'right',
			c: 'center'
		};
		align = align ? align : 'c';
		var imgObj = {};
		imgObj.alignment = alignMap[align];
		imgObj.canvasW = canvasW;
		imgObj.canvasH = canvasH;
		if (imgType === 'atlas') {
			var atlas = this.textureAtlas;
			var frame = atlas.frames[name];
			frame.clipId = name + ld.now();
			imgObj.clipId = frame.clipId;
			imgObj.imgW = atlas.width;
			imgObj.imgH = atlas.height;
			imgObj.url = atlas.url;
			imgObj.viewBox = [frame.x, frame.y, frame.w, frame.h].join(' ');
			imgObj.svgDefs = sprintf('<g><clipPath id="%(clipId)s"><rect x="%(x)s" y="%(y)s" width="%(w)s" height="%(h)s"/></clipPath></g>', frame);
			return sprintf('<span style="display:block; text-align:%(alignment)s;"><svg width="%(canvasW)s" height="%(canvasH)s" viewbox="%(viewBox)s">%(svgDefs)s<image clip-path="url(#%(clipId)s)" width="%(imgW)s" height="%(imgH)s" xlink:href="%(url)s"/></svg></span>', imgObj);

		} else if (imgType === 'url') {
			imgObj.url = name;
			return sprintf('<span style="display:block; text-align:%(alignment)s;"><svg width="%(canvasW)s" height="%(canvasH)s"><image width="100%%" height="100%%" xlink:href="%(url)s"/></svg></span>', imgObj);
		}
	});
}

if (!Vue.filter('textify')) {
	Vue.filter('textify', function (content, canvasH, align) { //width is always 100%
		var alignMap = {
			l: 'left',
			r: 'right',
			c: 'center'
		};
		align = align ? align : 'c';
		var txtObj = {};
		txtObj.alignment = alignMap[align];
		txtObj.content = content;
		txtObj.canvasH = canvasH + 'px';

		return sprintf('<span style="display:table; margin:auto; width:100%%; height:%(canvasH)s"><span style="display:table-cell; text-align: %(alignment)s; vertical-align: middle">%(content)s</span></span>', txtObj)
	});
}

// initiate qPP
(function () {
	jq(document).ready(function () {
		jq('body').css('visibility', 'hidden');
	});

	qPP.buttonsReadySgn = new qPP.Signal();
	qPP.buttonsReadySgn.memorize = true;
	qPP.windowLoadedSgn = new qPP.Signal();

	jq(window).load(function () {
		qPP.windowLoadedSgn.dispatch();
	});
	if (!qPP.engine.Page) {
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
		qPP.windowLoadedSgn.add(internalPageReadyHandler);
	} else {
		qPP.engine.Page.once('ready', internalPageReadyHandler);
	}

	function internalPageReadyHandler() {
		qPP.buttonsReadySgn.dispatch();
		qPP._setVMConstructPrereq('pageReady', true);
	}

	qPP.engine.addOnUnload(function () {
		jq('body').css('visibility', 'hidden');
		if (!qPP.engine.Page) {
			sessionStorage.nonPageRuntimeED = JSON.stringify(nonPageRuntimeED);
			sessionStorage.arbor = JSON.stringify(arbor);
		}
		qPP.VM.$destroy();
		console.log('page unloaded');
	});

})();