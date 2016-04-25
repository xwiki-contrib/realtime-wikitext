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

    var getFormToken = Interface.getFormToken = function () {
        return $('meta[name="form_token"]').attr('content');
    };

    /*
        This hides a DIFFERENT autosave, not the one included in the realtime
        This is a checkbox which is off by default. We hide it so that it can't
        be turned on, because that would cause some problems.
    */
    var setAutosaveHiddenState = Interface.setAutoSaveHiddenState = function (hidden) {
        var elem = $('#autosaveControl');
        if (hidden) {
            elem.hide();
        } else {
            elem.show();
        }
    };

    return Interface;
});
