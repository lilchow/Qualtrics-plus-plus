var ld = _.noConflict();

qPP.Signal = signals.Signal;

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
        if (qPP.jsQCount === 0) {
            console.log('vm ready promise resolved');
            qPP.pageVMReadyPromise.resolve();
            console.log('all in question js processed');
            qPP.inQuestionJSProcessedPromise.resolve();
        } else {
            console.log('vm ready promise resolved');
            qPP.pageVMReadyPromise.resolve();
        }
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
    };
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
    //convert all existing formulae To compEDs 
    ld.forEach(vmSource.data.formulae, qPP._convertFormulaToCompED);
    qPP.VM = new Vue(vmSource);
    qPP.VM.$mount(jq('form').get(0));
};

//question templating
if (!Vue.filter('pickContingency')) {
    Vue.filter('pickContingency', function (keyArrayString, contingencyName) {
        var factorValueArray = [].slice.call(arguments, 2);
        var key = factorValueArray.join('&');
        this.$set(contingencyName, keyArrayString.replace(/ /g, '').split(',').indexOf(key));
        var contingencyIndex = keyArrayString.replace(/ /g, '').split(',').indexOf(key);
        Vue.filter(contingencyName, function (valArrayString, textName) {
            var val = valArrayString.split('``')[contingencyIndex];
            if (textName) {
                this.$set(textName, val);
            }
            return val;
        });
        return '';
    });
}

if (!Vue.filter('pickContingencyBy')) {
    Vue.filter('pickContingencyBy', function (contingencyArrayString) {
        var factorNameArray = [].slice.call(arguments, 1);
        var factorValueArray = factorNameArray.map(function (name) {
            return this.$get(name);
        }, this);
        var contingencyName = '$' + factorNameArray.join('$');
        var contingencyValue = factorValueArray.join('&');
        var contingencyIndex = contingencyArrayString.replace(/ /g, '').split(',').indexOf(contingencyValue);
        Vue.filter(contingencyName, function (valArrayString, textName) {
            var val = valArrayString.split(':::')[contingencyIndex];
            if (textName) {
                this.$set(textName, val);
            }
            return val;
        });
        return '';
    });
}

//this is for picking alternative texts directly typed in the question-text in gui

qPP.pickContingentText = function (q, id, factorNameArray, contingencyArray) {
    factorNameArray = [].concat(factorNameArray);
    var factorValueArray = factorNameArray.map(function (name) {
        return qPP.getED(name);
    });
    var contingencyValue = factorValueArray.join('&');
    var rangeStartContainer = jq('#' + q.questionId)[0];
    var tgtRngMarker = new RegExp('=#=(.+?)=' + id + '=', 'm');
    //var tgtRngMarker = /{\+{(.+?)}\+}/m;
    var range = rangy.createRange();
    qPP.pageVisiblePromise.done(function () {
        var alternatives, pickedAlternative, pickedIndex, startOffset, endContainer, endOffset;
        pickedIndex = contingencyArray.indexOf(contingencyValue);
        range.selectNodeContents(rangeStartContainer);
        startOffset = range.startOffset;
        while (range.findText(tgtRngMarker, {
                direction: "backward"
            })) {
            endOffset = range.startOffset;
            endContainer = range.startContainer;
            alternatives = range.text().match(tgtRngMarker)[1];
            pickedAlternative = alternatives.split(':::')[pickedIndex];
            range.pasteHtml(pickedAlternative);
            range.setStartAndEnd(rangeStartContainer, startOffset, endContainer, endOffset);
        }
    });

};

//text-entry type controls manipulation:
qPP.addTextEntryHints = function (q) {
    if (qPP._getQuestionType(q) !== 'TE' || arguments.length < 2) {
        return;
    }
    var args = [].slice.call(arguments);
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

qPP.decorateTextEntry = function (q, prefix, suffix, width) {
    if (!width) {
        width = 50;
    }
    if (qPP._getQuestionType(q) === 'TE' && qPP._getQuestionSelector(q) === 'SL') {
        jq("#" + q.questionId).find('.InputText')
            .css('display', 'inline')
            .before('<span>' + prefix + "</span>")
            .after('<span>' + suffix + "</span>")
            .width(width + 'px');
    }
};

qPP.changeFormEntryWidth = function (q, width) {
    var hostQElm = jq('#' + q.questionId);
    var inputs = jq('.InputText', hostQElm).width(width + 'px');
    inputs.closest('td').prev().css('text-align', 'right');
};

qPP.collapseFormEntries = function (q, suffix, widthArray) {
    var hostQElm = jq('#' + q.questionId);
    var container = jq('<div>');
    var inputs = jq('.InputText', hostQElm);
    var labels = jq('.ChoiceStructure tr td .LabelWrapper label', hostQElm);
    inputs.each(function (idx) {
        container.append(
            jq(this).css('display', 'inline')
            .width(widthArray[idx] + 'px')
        );
        jq(this).before(labels.eq(idx));
    });
    container.append('<span>' + suffix + "</span>");
    jq('.ChoiceStructure', hostQElm).prepend(container);
    jq('.ChoiceStructure table', hostQElm).hide();
};

qPP.validateTextInput = function (q, validatorName, validatorValue, errMsg) {
    var validationOptions = {
        required: true,
        whitespace: 'trim',
        group: 'parsleyInputs',
        trigger: "focusout mouseleave"
    };
    validationOptions[validatorName] = validatorValue;
    if (errMsg) {
        validationOptions.errorMessage = errMsg;
    }

    var hostQElm = jq('#' + q.questionId);
    jq('.InputText', hostQElm).parsley(validationOptions);

    qPP.modButtons(validateParsleyForm);

    function validateParsleyForm() {
        if (jq('#Page').parsley().validate({
                group: 'parsleyInputs'
            })) {
            qPP.deModButtons();
            jq('#NextButton').click();
        }
    }
};

qPP.addWordCounter = function (q) {
    var hostQElm = jq('#' + q.questionId);
    var qBody = hostQElm.find('.QuestionBody');
    var counter = jq.emmet("div.ht-bt > span.bg-info{word count: } > span.badge")
        .appendTo(qBody.find('.ChoiceStructure'))
        .find('span.badge').text(0);

    qBody.find('textarea')
        .change(countWord)
        .keyup(countWord);

    function countWord() {
        var enteredTxt = qBody.find('textarea').val();
        if (enteredTxt.length === 0) {
            counter.text(0);
        } else {
            var wordCount = enteredTxt.trim().replace(/\s+/gi, ' ').split(' ').length;
            counter.text(wordCount);
        }
    }
};

qPP.createSingleSlider = function (q, startPos, gridInterval, width, minLbl, maxLbl) {
    var hostQElm = jq("#" + q.questionId);
    var textInput = jq('input.InputText', hostQElm);
    var minLblContainer,
        maxLblContainer;
    minLbl = jq.emmet('p(style="text-align:center")').html(minLbl).get(0).outerHTML;
    maxLbl = jq.emmet('p(style="text-align:center")').html(maxLbl).get(0).outerHTML;
    textInput.ionRangeSlider({
        type: "single",
        min: 0,
        max: 100,
        from: startPos,
        step: 1,
        grid: gridInterval !== 0,
        grid_num: gridInterval,
        hide_from_to: true,
        force_edges: true,
        onStart: function () {
            minLblContainer = jq('.irs-min');
            maxLblContainer = jq('.irs-max');
            jq('.ChoiceStructure', hostQElm).width(width + 'px');
            qPP.inQuestionJSProcessedPromise.done(function () {
                minLblContainer.html(minLbl);
                maxLblContainer.html(maxLbl);
            });

        },
        onFinish: function (data) {
            minLblContainer.html(minLbl);
            maxLblContainer.html(maxLbl);
        }
    });

};

qPP.disableCopyPaste = function (q) {
    jq("#" + q.questionId).on("cut copy paste", ".QuestionBody input:text, .QuestionBody textarea, .QuestionText", function (e) {
        e.stopPropagation();
        e.preventDefault();
    });
};

qPP.setTextEntryValue = function (q, content) {
    var hostQElm = jq("#" + q.questionId);
    jq('input.InputText', hostQElm).insertText(content, 0);
};

//non text-entry type question manipulaiton
qPP.createBipolarLikert = function (q, min, leftAnchor, rightAnchor) { //only minimal value is needed, turn bipolar question into decent liker
    var queBody = jq('#' + q.questionId).find('.QuestionBody').addClass('ht-bt');
    var tableRows = queBody.find('.ChoiceRow');
    tableRows.each(function (idx) {
        var currentTableRow = jq(this);
        var radios = jq('td:has(input:radio)', currentTableRow)
            .wrapInner('<label class="btn btn-default">')
            .find('input:radio');
        jq.each(radios, function (idx) {
            jq(this).after(min + idx)
                .css({
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    visibility: 'hidden'
                });
        });
        var btnGrp = jq('<td class="btn-group btn-group-justified">')
            .append(currentTableRow.find('label.btn').css('position', 'relative'));
        //leftAnchor=currentTableRow.find('.AnswerLeft').text();
        //rightAnchor=currentTableRow.find('.AnswerLeft').text();
        var left = jq('<td style="width:18%">').html('<span class="badge">' + leftAnchor + '</span>');
        var right = jq('<td style="width:18%">').html('<span class="badge">' + rightAnchor + '</span>');
        currentTableRow.empty().append(left).append(btnGrp).append(right);
    });

    var allRadioBtns = jq('.btn input:radio', queBody);
    allRadioBtns.filter(':checked').parent().addClass('active');
    queBody.on('change', '.btn input:radio', function () {
        allRadioBtns.parent().removeClass('active');
        allRadioBtns.filter(':checked').parent().addClass('active');
    });
};

qPP.addHeadingsToBipolar = function (q, headingTextArray) {
    var hostQElm = jq("#" + q.questionId);
    var headings = jq('<tr></tr>').insertBefore(jq('.ChoiceRow', hostQElm));
    headings.append(jq('<th class="bipolarHeading" colspan="100%">'));
    jq('.bipolarHeading', hostQElm).each(function (index) {
        jq(this).css('background-color', 'beige')
            .css('text-align', 'left')
            .text(headingTextArray[index]);
    });
};


//button manipulation
qPP.modButtons = function (newFunction) {
    function enhancedNewFunction(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        newFunction();
    }
    qPP.deModButtons();
    jq('#Buttons')[0].modFunction = enhancedNewFunction;
    jq('#Buttons')[0].addEventListener("click", jq('#Buttons')[0].modFunction, true);
};

qPP.deModButtons = function () {
    if (jq('#Buttons')[0].modFunction) {
        jq('#Buttons').get(0).removeEventListener("click", jq('#Buttons')[0].modFunction, true);
        delete jq('#Buttons')[0].modFunction;
    }

};

qPP.showButtons = function () {
    jq('#Buttons').show();
};

qPP.hideButtons = function (time) { //time in seconds
    qPP.inQuestionJSProcessedPromise.done(function () {
        console.log('hide buttons');
        jq('#Buttons').hide();
        if (!time) {
            return;
        }
        setTimeout(qPP.showButtons, time * 1000);
    });
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
        }
        return '<span style="background-color:' + color + '">' + arr.pop() + '</span>';
    };
    return function (q) {
        var ele = jq('#' + q.questionId)
            .find('.QuestionText').addClass('ht-bt mdMode');
        var mdTxt = ele.text().replace(/^\s*/, "");
        ele.html(marked(mdTxt, {
            renderer: qPPRenderer
        }));
    };
})();

//creating image grid
qPP.createImageGrid = function (q, nCol, imgHeight, imgArray, capArray, topCap) {
    if (!Array.isArray(imgArray) || nCol > 4 || nCol <= 0) {
        return;
    }
    var colWidth = 12 / nCol;
    var hostQElm = jq("#" + q.questionId);
    var gridContainer = jq.emmet('div.well')
        .appendTo(jq('.QuestionText', hostQElm).addClass('ht-bt'));

    var totalImgCnt = imgArray.length;
    var nRow = Math.ceil(totalImgCnt / nCol);
    var lastRowNCol = totalImgCnt % nCol === 0 ? nCol : totalImgCnt % nCol;
    for (var i = 0; i < nRow; i++) {
        gridContainer.append(Emmet('div.row'));
    }

    gridContainer.find('.row').each(function (idx) {
        var nthRow = idx + 1;
        for (var i = 0; i < (nthRow < nRow ? nCol : lastRowNCol); i++) {
            var thumbnailWrapper = jq.emmet('div.col-xs-{0}', false, [colWidth])
                .append(
                    jq.emmet('div.thumbnail')
                    .html(Emmet('div.grid-img-wrapper(style="height:{0}px")', true, [imgHeight]))
                );
            jq(this).append(thumbnailWrapper);
        }
    });

    gridContainer.find('.thumbnail .grid-img-wrapper').each(function (idx) {
        jq(this)
            .html(Vue.filter('imagify').call(qPP.VM, imgArray[idx], jq(this).width(), imgHeight, 'c'));
        if (capArray) {
            if (topCap) {
                jq(this).parent()
                    .prepend(Emmet('div.caption.text-center{ {0} }', false, [capArray[idx]]));
            } else {
                jq(this).parent()
                    .append(Emmet('div.caption.text-center{ {0} }', false, [capArray[idx]]));
            }

        }
    });
};

//make multiple questions into an accordion form
qPP.setAsAccordionHead = function (q) {
    qPP._setAsAccordion(q, 'head');
};

qPP.setAsAccordionTail = function (q) {
    qPP._setAsAccordion(q, 'tail');
};

qPP._setAsAccordion = function slides(q, headOrTail) {
    var hostQElm = jq("#" + q.questionId);
    if (headOrTail === 'head') {
        slides.headElm = hostQElm;
    } else {
        slides.allElms = hostQElm.prevUntil(slides.headElm, '.QuestionOuter')
            .addBack()
            .add(slides.headElm);
        slides.allElms.prev('.Separator').remove();
        slides.allElms.wrapAll(Emmet('div.qPPAccordion'));
        slides.allElms.each(function (idx) {
            jq(this).before(Emmet('h3.ht-bt > span.btn.btn-default.btn-xs > span.badge{Question #' + (idx + 1) + '}'));
        });
        slides.allElms.eq(0).parent()
            .accordion({
                heightStyle: "content",
                icons: {
                    "header": "glyphicon glyphicon-chevron-right",
                    "activeHeader": "glyphicon glyphicon-chevron-down"
                }
            });
    }
};

// make multiple questions into a slideshow form
qPP.setAsSlideHead = function (q) {
    qPP._setAsSlide(q, 'head');
};

qPP.setAsSlideTail = function (q) {
    qPP._setAsSlide(q, 'tail');
};

qPP._setAsSlide = function slides(q, headOrTail) {
    var hostQElm = jq("#" + q.questionId);
    if (headOrTail === 'head') {
        slides.headElm = hostQElm;
    } else {
        slides.allElms = hostQElm.prevUntil(slides.headElm, '.QuestionOuter')
            .addBack()
            .add(slides.headElm);
        delete slides.headElm;
        slides.allElms.prev('.Separator').remove();
        slides.allElms.next('.Separator').remove();
    }
};

qPP.createSlideshow = function createSlideshow(q) { //named function expression so that it can be referenced within itself
    var hostQElm = q.questionId ? jq("#" + q.questionId) : jq(document);
    qPP.hideButtons();
    jq('.Separator').hide();
    var slideshowContainer = jq('.QuestionText', hostQElm).css({
        padding: '0px',
        margin: '0px'
    });

    var navTabWrapper = jq.emmet('div.ht-bt > ul.nav.nav-tabs.nav-justified')
        .appendTo(slideshowContainer)
        .find('ul.nav')
        .css('margin-left', '0px');
    var slideshowWrapper = jq.emmet('div.slideshow').appendTo(slideshowContainer);
    var pagers = jq.emmet('div.ht-bt > ul.pager > li+li')
        .appendTo(slideshowContainer)
        .find('li');
    pagers.append(jq.emmet('a.(href="#")').css('pointer-events', 'none'));
    slideshowWrapper
        .css({
            margin: 'auto',
            width: jq('.QuestionText', hostQElm).width()
        })
        .on('init', function (evt, slick) {
            slick.$slider.css({
                border: '0.5px solid #ddd',
                borderTop: '0px'
            });
        })
        .slick({
            infinite: false,
            accessibility: false,
            prevArrow: pagers.find('a').eq(0).html('<span class="glyphicon glyphicon-arrow-left"></span>').parent(),
            nextArrow: pagers.find('a').eq(1).html('<span class="glyphicon glyphicon-arrow-right"></span>').parent(),
            speed: 250
        });
    ld.forEach(qPP._setAsSlide.allElms, function (slideElm, idx) {
        slideElm.hide();
        slideshowWrapper.slick('slickAdd', jq('.QuestionText', slideElm)[0]);
        jq.emmet('li > a(href="#")').appendTo(navTabWrapper)
            .find('a').text(idx + 1).css('pointer-events', 'none');
        //        jq.emmet('li').text(idx+1).appendTo(crumbs);
    });
    var navTabs = jq('li', navTabWrapper);
    navTabs.eq(0).addClass('active');
    slideshowWrapper.on('afterChange', function (event, slick, currentSlide) {
        navTabs.removeClass('active');
        navTabs.eq(currentSlide).addClass('active');
        if (currentSlide === slick.slideCount - 1) {
            qPP.showButtons();
        }
    });
    Mousetrap.bind(['left', 'right'], function (evt, key) {
        evt.preventDefault();
        if (key === 'left') {
            slideshowWrapper.slick('slickPrev');
        } else if (key === 'right') {
            slideshowWrapper.slick('slickNext');
        }
        return false;
    });
};

//make long text into a scrollable form
qPP.createScroller = function (q, height) {
    qPP.hideButtons();
    var hostQElm = jq("#" + q.questionId);
    var qTxtElm = jq('.QuestionText', hostQElm);
    qTxtElm
        .slimScroll({
            height: height + 'px',
            railVisible: true,
            alwaysVisible: true
        })
        .bind('slimscroll', function (evt, pos) {
            if (pos === 'bottom') {
                qPP.showButtons();
            }
        })
        .parent().css({
            'border-style': 'dotted',
            'border-color': 'grey',
            'border-width': '2px 0px 2px 2px'
        });

};

//audio and video related
qPP.createSoundChecker = function (q) {
    qPP.hideButtons();
    var hostQ = jq("#" + q.questionId);
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
    }

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
        });
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
                alert.hide();
            }, 1500);
            alert.show();
        }
    }
};

qPP.addMedia = function (q, url, autoplay, width) {
    qPP.hideButtons();
    var curriedCompleteHandler = ld.partial(qPP._createMediaPlayer, ld, autoplay, width);
    qPP._preloadMedia(q, url, qPP._displayDownloadProgressBar, curriedCompleteHandler, qPP._alertDownloadFailure);
};

qPP._preloadMedia = function (q, url, progressHandler, completeHandler, errorHandler) {
    var preloaderContext = {
        hostQElm: q.questionId ? jq("#" + q.questionId) : jq(document)
    };

    var preloader = new createjs.LoadQueue(true);
    preloader.on('progress', progressHandler, preloaderContext);
    preloader.on('fileload', completeHandler, preloaderContext);
    preloader.on('error', errorHandler, preloaderContext);
    preloader.loadFile(url);
};

qPP._createMediaPlayer = function (evt, autoplay, width) {
    var that = this;
    that.pbContainer.remove();
    delete that.pbContainer;
    var mediaPlayerOptions = {
        autoplay: autoplay,
        controls: false
    };
    if (evt.item.type !== 'video') {
        mediaPlayerOptions.height = 0;
        mediaPlayerOptions.width = 400;
    } else {
        mediaPlayerOptions.width = width || 400;
    }
    var mediaTag = jq(evt.result)
        .addClass("video-js vjs-default-skin")
        .appendTo(jq('.QuestionText', that.hostQElm));
    var mediaPlayer = videojs(mediaTag[0], mediaPlayerOptions, function () {
        var mediaPlayerContainer = jq(mediaPlayer.el()).css('margin', 'auto');
        var mediaPlayerControlBar = jq.emmet('div.ht-bt>div.container-fluid>div.row')
            .width(mediaPlayer.width())
            .css('margin', 'auto')
            .insertAfter(mediaPlayerContainer)
            .find('div.row');

        jq.emmet('div.col-xs-2.noPaddingMargin>button.btn.btn-sm.btn-info.btn-block(type="button")>span.glyphicon.glyphicon-play')
            .appendTo(mediaPlayerControlBar);
        jq.emmet('div.col-xs-10.noPaddingMargin.bg-info>div.playerProgress+div.statusMsg.text-center{ready}')
            .appendTo(mediaPlayerControlBar);

        var btn = jq('.btn', mediaPlayerControlBar)
            .on('click', function (evt) {
                evt.stopPropagation();
                evt.preventDefault();
                mediaPlayer.paused() ? mediaPlayer.play() : mediaPlayer.pause();
            });
        var btnLabel = btn.children('span.glyphicon');
        var statusBar = jq('div.bg-info', mediaPlayerControlBar)
            .css({
                height: btn.outerHeight(),
                position: 'relative'
            });
        var mediaProgress = jq('.playerProgress', statusBar)
            .css({
                position: 'absolute',
                width: '0%',
                height: '12%',
                bottom: 0,
                backgroundColor: 'grey'
            });
        var statusMsg = jq('.statusMsg', statusBar);
        if (!mediaPlayer.paused()) {
            statusMsg.text('playing');
            btnLabel.toggleClass('glyphicon-play glyphicon-pause');
        }
        mediaPlayer.on('timeupdate', function () {
            var playedPercentage = (mediaPlayer.currentTime() * 100 / mediaPlayer.duration()).toFixed(1) + '%';
            mediaProgress.width(playedPercentage);
        });
        mediaPlayer.on('pause', function () {
            statusMsg.text('paused');
            btnLabel.toggleClass('glyphicon-play glyphicon-pause');
        });
        mediaPlayer.on('play', function () {
            statusMsg.text('playing');
            btnLabel.toggleClass('glyphicon-play glyphicon-pause');
        });
        mediaPlayer.on('ended', function () {
            jq(document).off('visibilitychange');
            qPP.showButtons();
            statusMsg.text('completed');
        });

        jq(document).on('visibilitychange', function () { //see if the browser tab is in focus or not
            if (this['hidden']) {
                mediaPlayer.pause();
            }
        });
    });
};

qPP._displayDownloadProgressBar = function (evt) {
    var that = this;
    var percentage = evt.progress * 100;
    console.log('downloading ', percentage);
    if (!that.pbContainer) {
        that.pbContainer = jq.emmet('div.ht-bt>div.form-group')
            .appendTo(jq('.QuestionText', that.hostQElm))
            .find('.form-group');
        that.pbContainer
            .append(jq.emmet('label{downloading file:}'))
            .append(jq.emmet('div.progress>div.progress-bar(style="width: 0%;")'));
    } else {
        jq('.progress-bar', that.pbContainer).css('width', percentage + '%');
    }
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
    var hostQElm = jq("#" + q.questionId);
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
            resp = jq('.InputText', hostQElm).val();
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
    var preloaderContext = {
        hostQElm: jq("#" + q.questionId)
    };
    qPP.edSnapshotLocker.textureAtlas = {};
    var loadQueue = new createjs.LoadQueue(false);
    loadQueue.on("complete", handlePreloadComplete, preloaderContext);
    loadQueue.on("progress", qPP._displayDownloadProgressBar, preloaderContext);
    loadQueue.loadFile({
        id: "atlasImg",
        src: picLink
    });
    loadQueue.loadFile({
        id: "atlasHash",
        src: jsonLink
    });

    function handlePreloadComplete(evt) {
        var that = this;
        that.pbContainer.remove();
        delete that.pbContainer;
        var json = evt.target.getResult('atlasHash');
        var blobSrc = evt.target.getResult('atlasImg').src;
        processJson(json, blobSrc);
    }

    function processJson(json, blobSrc) {
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

if (!Vue.filter('imagifyA')) {
    Vue.filter('imagifyA', function (name, canvasW, canvasH) { //name is either hashkey for atlas image or url link for url image
        var atlas = this.textureAtlas;
        var imgObj = {};
        imgObj.canvasW = canvasW;
        imgObj.canvasH = canvasH;
        imgObj.alignment = "center";
        imgObj.url = atlas.url;
        return sprintf('<img src="%(url)s">', imgObj);
    });
}


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

        return sprintf('<span style="display:table; margin:auto; width:100%%; height:%(canvasH)s"><span style="display:table-cell; text-align: %(alignment)s; vertical-align: middle">%(content)s</span></span>', txtObj);
    });
}

//modeuls related to running experiment
