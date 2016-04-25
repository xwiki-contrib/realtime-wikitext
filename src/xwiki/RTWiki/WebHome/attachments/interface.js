/*
    This file defines functions which are used in RTWIKI, and address components
    of the user interface.
*/
define([
    'jquery'
], function ($) {
    var Interface = {};

    var uid = Interface.uid = function () {
        return 'rtwiki-uid-' + String(Math.random()).substring(2);
    };

    var setStyle = Interface.setStyle = function () {
        $('head').append([
            '<style>',
            '.rtwiki-toolbar {',
            '    width: 100%;',
            '    color: #666;',
            '    font-weight: bold;',
            '    background-color: #f0f0ee;',
            '    border: 0, none;',
            '    height: 24px;',
            '    float: left;',
            '}',
            '.rtwiki-toolbar div {',
            '    padding: 0 10px;',
            '    height: 1.5em;',
            '    background: #f0f0ee;',
            '    line-height: 25px;',
            '    height: 24px;',
            '}',
            '.rtwiki-toolbar-leftside {',
            '    float: left;',
            '}',
            '.rtwiki-toolbar-rightside {',
            '    float: right;',
            '}',
            '.rtwiki-lag {',
            '    float: right;',
            '}',
            '.rtwiki-merge {',
            '    float: left',
            '}',
            '#secret-merge {',
            '   opacity: 0;',
            '}',
            '#secret-merge:hover {',
            '   opacity: 1;',
            '}',
            '</style>'
         ].join(''));
    };

    var createUserList = Interface.createUserList = function (/*realtime, myUserName,*/ container /*, messages*/) {
        var id = uid();
        $(container).prepend('<div class="rtwiki-userlist" id="'+id+'"></div>');
        var listElement = $('#'+id);
        return listElement;
    };

    var createRealtimeToolbar = Interface.createRealtimeToolbar = function (container) {
        var id = uid();
        $(container).prepend(
            '<div class="rtwiki-toolbar" id="' + id + '">' +
                '<div class="rtwiki-toolbar-leftside"></div>' +
                '<div class="rtwiki-toolbar-rightside"></div>' +
            '</div>'
        );
        return $('#'+id);
    };

    var checkLag = Interface.checkLag = function (realtime, lagElement, messages) {
        var lag = realtime.getLag();
        var lagSec = lag.lag/1000;
        var lagMsg = messages.lag + ' ';
        if (lag.waiting && lagSec > 1) {
            lagMsg += "?? " + Math.floor(lagSec);
        } else {
            lagMsg += lagSec;
        }
        lagElement.text(lagMsg);
    };

    var createLagElement = Interface.createLagElement = function (socket, realtime, container, messages) {
        var id = uid();
        $(container).append('<div class="rtwiki-lag" id="'+id+'"></div>');
        var lagElement = $('#'+id);
        var intr = setInterval(function () {
            checkLag(realtime, lagElement, messages);
        }, 3000);
        socket.onClose.push(function () { clearTimeout(intr); });
        return lagElement;
    };

    var createAllowRealtimeCheckbox = Interface.createAllowRealtimeCheckbox = function (id, checked, message) {
        $('#mainEditArea .buttons').append(
            '<div class="rtwiki-allow-outerdiv">' +
                '<label class="rtwiki-allow-label" for="' + id + '">' +
                    '<input type="checkbox" class="rtwiki-allow" id="' + id + '" ' +
                        checked + '" />' +
                    ' ' + message +
                '</label>' +
            '</div>'
        );
    };

    var getFormToken = Interface.getFormToken = function () {
        return $('meta[name="form_token"]').attr('content');
    };

    /*
        This hides a DIFFERENT autosave, not the one included in the realtime
        This is a checkbox which is off by default. We hide it so that it can't
        be turned on, because that would cause some problems.
    */
    var setAutosaveHiddenState = Interface.setAutosaveHiddenState = function (hidden) {
        var elem = $('#autosaveControl');
        if (hidden) {
            elem.hide();
        } else {
            elem.show();
        }
    };

    /*  TODO
        move into Interface (after factoring out more arguments)
        // maybe this should go in autosaver instead?
    */
    var createMergeMessageElement = Interface.createMergeMessageElement = function (container, messages) {
        var id = uid();
        $(container).prepend( '<div class="rtwiki-merge" id="'+id+'"></div>');
        var $merges = $('#'+id);

        var timeout;

        // drop a method into the lastSaved object which handles messages
        return function (msg_type, args) {
            // keep multiple message sequences from fighting over resources
            timeout && clearTimeout(timeout);

            var formattedMessage = messages[msg_type].replace(/\{(\d+)\}/g, function (all, token) {
                // if you pass an insufficient number of arguments
                // it will return 'undefined'
                return args[token];
            });

            debug(formattedMessage);

            // set the message, handle all types
            $merges.text(formattedMessage);

            // clear the message box in five seconds
            // 1.5s message fadeout time
            timeout = setTimeout(function () {
                $merges.fadeOut(1500, function () {
                    $merges.text('');
                    $merges.show();
                });
            },10000);
        };
    };

    return Interface;
});
