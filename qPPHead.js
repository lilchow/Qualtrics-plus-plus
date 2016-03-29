var jq = $.noConflict(),
    qPP = {
        VM: null,
        engine: Qualtrics.SurveyEngine,
        jsQCount: 0
            //styleSheet: jq('#qPPStyleSheet')[0].sheet
    },
    myGlbVar;

(function init() {

    qPP.styleSheet = (function () {
        var style = document.createElement("style");
        // WebKit hack :(
        style.appendChild(document.createTextNode(""));
        document.head.appendChild(style);
        return style.sheet;
    })();
    qPP.styleSheet.insertRule('#Questions.readyBody,#Buttons.readyBody {visibility: visible;}', qPP.styleSheet.cssRules.length);
    qPP.styleSheet.insertRule('.noPadding {padding: 0 !important; margin: 0 !important;}', qPP.styleSheet.cssRules.length);
    qPP.styleSheet.insertRule('.slick-prev:before,.slick-next:before {color:#337ab7;}', qPP.styleSheet.cssRules.length);
    qPP.styleSheet.insertRule('.slick-prev,.slick-next {pointer-events: none;}', qPP.styleSheet.cssRules.length);
    qPP.styleSheet.insertRule('.slick-dots {top: -20px}', qPP.styleSheet.cssRules.length);

    qPP.windowLoadedPromise = jq.Deferred();
    qPP.internalPageReadyPromise = jq.Deferred();
    qPP.pageVMReadyPromise = jq.Deferred();
    qPP.inQuestionJSProcessedPromise = jq.Deferred();
    qPP.pageVisiblePromise = jq.Deferred();

    window.onload = function () {
        qPP.windowLoadedPromise.resolve();
    };


    if (!qPP.engine.Page) {
        qPP.engine.addOnload = function (handler) {
            if ($('body') && $('body').hasClassName('EditSection'))
                return;
            var currentQ = new qPP.engine.QuestionData();
            qPP.pageVMReadyPromise.done(function () {
                //console.log('process in q js');
                handler.apply(currentQ);
                //console.log('in q js processed');
                qPP.jsQCount--;
                if (qPP.jsQCount === 0) {
                    console.log('all in question js processed');
                    qPP.inQuestionJSProcessedPromise.resolve();
                }
            });
        };
        qPP.windowLoadedPromise.done(internalPageReadyHandler);
    } else {
        qPP.engine.addOnload = function (handler) {
            qPP.jsQCount++;
            var currentQ = new qPP.engine.QuestionData;
            qPP.pageVMReadyPromise.done(function () {
                //console.log('process in q js');
                handler.apply(currentQ);
                //console.log('in q js processed');
                qPP.jsQCount--;
                if (qPP.jsQCount === 0) {
                    console.log('all in question js processed');
                    qPP.inQuestionJSProcessedPromise.resolve();
                }
            });
        };
        qPP.engine.Page.once('ready', internalPageReadyHandler);
    }

    function internalPageReadyHandler() {
        console.log('internal page ready promise resolved');
        qPP.internalPageReadyPromise.resolve();
    }
})();

head.load(
    "https://cdn.rawgit.com/lilchow/Qualtrics-plus-plus/0df56be488acabcefdf55831ce4387e1062c2038/prefixedBootstrap.css",
    "https://cdnjs.cloudflare.com/ajax/libs/ion-rangeslider/2.1.2/css/ion.rangeSlider.min.css",
    "https://cdnjs.cloudflare.com/ajax/libs/ion-rangeslider/2.1.2/css/ion.rangeSlider.skinHTML5.min.css",
    "https://cdn.jsdelivr.net/jquery.slick/1.5.9/slick.css",
    "https://cdn.jsdelivr.net/jquery.slick/1.5.9/slick-theme.css",
    //separate============================================================
    "https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.11.4/jquery-ui.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.6.1/lodash.min.js",
    "https://cdn.rawgit.com/christiansandor/Emmet.js/master/dist/emmet.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/js-signals/1.0.0/js-signals.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/marked/0.3.5/marked.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/sprintf/1.0.3/sprintf.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/vue/1.0.17/vue.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/jquery.serializeJSON/2.7.2/jquery.serializejson.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/video.js/5.8.3/video-js.min.css",
    "https://cdnjs.cloudflare.com/ajax/libs/spin.js/2.3.2/spin.min.js",
    "https://cdn.jsdelivr.net/jquery.slick/1.5.9/slick.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/ion-rangeslider/2.1.2/js/ion.rangeSlider.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/jQuery-slimScroll/1.3.7/jquery.slimscroll.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/video.js/5.8.3/video.min.js",
    "https://code.createjs.com/preloadjs-0.6.2.min.js",
    "https://code.createjs.com/soundjs-0.6.2.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/tabletop.js/1.4.3/tabletop.min.js",
    "https://cdn.jsdelivr.net/g/mousetrap@1.5.3(mousetrap.min.js+plugins/pause/mousetrap-pause.min.js)",
    "https://cdnjs.cloudflare.com/ajax/libs/rangy/1.3.0/rangy-core.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/rangy/1.3.0/rangy-textrange.min.js",
    "https://cdn.rawgit.com/timdown/rangyinputs/master/rangyinputs-jquery.js",
    "https://dl.dropboxusercontent.com/u/3493773/qPPLibs/qPPCore.js"
);

head.ready(
    function () {
        jq(document).ready(function () {
            qPP.pageBody = jq('body').css('padding', '0px')
                .find('.Skin .SkinInner').css('margin', '0px auto')
                .children().css('padding', '0px')
                .find('#Questions').add('#Buttons');
            jq('form').css('visibility', 'hidden');
        });
        qPP.internalPageReadyPromise.done(function () {
            qPP._setVMConstructPrereq('pageReady', true);
        });

        qPP.inQuestionJSProcessedPromise.done(function () {
            qPP.pageBody.addClass('readyBody');
            jq('form').css('visibility', 'visible');
            qPP.pageVisiblePromise.resolve();
        });

        qPP.engine.addOnUnload(function () {
            qPP.pageBody.removeClass('readyBody');
            jq('form').css('visibility', 'hidden');
            if (!qPP.engine.Page) {
                sessionStorage.nonPageRuntimeED = JSON.stringify(nonPageRuntimeED);
                sessionStorage.arbor = JSON.stringify(arbor);
            }
            qPP.VM.$destroy();
            console.log('page unloaded');
        });

    }
);
