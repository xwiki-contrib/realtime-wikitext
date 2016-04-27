define([
  'jquery',
  'RTWiki_WebHome_sharejs_textarea',
  'RTWiki_ErrorBox',
  'RTWiki_WebHome_interface',
  'RTWiki_WebHome_saver',
  'RTWiki_WebHome_section',
  'RTWiki_WebHome_chainpad',
], function($, TextArea, ErrorBox, Interface, Saver, Section) {
    var ChainPad = window.ChainPad;
    var module = { exports: {} };

    /*  TODO
        move all your constants into an object that you can inspect more easily
    */
    var LOCALSTORAGE_DISALLOW = 'rtwiki-disallow';

    // How long to wait before determining that the connection is lost.
    var MAX_LAG_BEFORE_DISCONNECT = 30000;

    // we can't avoid putting this in a very high scope, because lots of things
    // rely on it. Modify with extreme caution and avoid race conditions
    var mainConfig;

    var warn = function (x) {};
    var debug = function (x) {};
    // there was way too much noise, if you want to know everything use verbose
    var verbose = function (x) {};
    //verbose = function (x) { console.log(x); };
    debug = function (x) { console.log(x) };
    warn = function (x) { console.log(x) };

    var uid = Interface.uid;

    var now = function () { return (new Date()).getTime(); };

    /*  FIXME
        this will yield a false positive for any document which has 'template'
        in its URL. /\?.*template/.test(window.location.href) might be a less
        brittle solution.

        TODO
        we might want this in realtime-frontend
    */
    /**
     * If we are editing a page which does not exist and creating it from a template
     * then we should not auto-save the document otherwise it will cause RTWIKI-16
     */
    var createPageMode = function () {
        return (window.location.href.indexOf('template=') !== -1);
    };

    /*  TODO
        replace with Netflux
    */
    var isSocketDisconnected = function (socket, realtime) {
        return socket.readyState === socket.CLOSING ||
            socket.readyState === socket.CLOSED ||
            (realtime.getLag().waiting && realtime.getLag().lag > MAX_LAG_BEFORE_DISCONNECT);
    };

    /*  TODO
        replace sockets with Netflux
    */
    var startWebSocket = function (textArea,
                                   toolbarContainer,
                                   websocketUrl,
                                   userName,
                                   channel,
                                   messages,
                                   demoMode,
                                   language)
    {

        debug("Opening websocket");
        localStorage.removeItem(LOCALSTORAGE_DISALLOW);

        var toolbar = Interface.createRealtimeToolbar(toolbarContainer);

        // TODO figure out a way to fake the back end not being present so that
        // we can properly test this bug.
        var socket = new WebSocket(websocketUrl);
        socket.onClose = [];
        socket.onMessage = [];
        var initState = $(textArea).val();
        var realtime = socket.realtime = ChainPad.create(userName, 'x', channel, initState);
        // for debugging
        window.rtwiki_chainpad = realtime;

        // http://jira.xwiki.org/browse/RTWIKI-21
        var onbeforeunload = window.onbeforeunload || function () { };
        window.onbeforeunload = function (ev) {
            socket.intentionallyClosing = true;
            return onbeforeunload(ev);
        };

        // TODO provide UI hints to show whether the backend was available
        // http://jira.xwiki.org/browse/RTBACKEND-12
        var isErrorState = false;
        var checkSocket = function () {
            if (socket.intentionallyClosing || isErrorState) { return false; }
            if (isSocketDisconnected(socket, realtime)) {
                realtime.abort();
                socket.close();
                // TODO differentiate between being disconnected
                // and never having connected to begin with
                // ie. make sure that we've gotten at least one ping response
                ErrorBox.show('disconnected');
                isErrorState = true;
                return true;
            }
            return false;
        };

        socket.onopen = function (evt) {
            var initializing = true;

            var userListElement = Interface.createUserList(toolbar.find('.rtwiki-toolbar-leftside'));

            userListElement.text(messages.initializing);

            Interface.createLagElement(socket,
                             realtime,
                             toolbar.find('.rtwiki-toolbar-rightside'),
                             messages);

            // this function displays a message notifying users that there was a merge
            Saver.lastSaved.mergeMessage = Interface.createMergeMessageElement(toolbar
                .find('.rtwiki-toolbar-rightside'),
                messages);

            // hide the toggle for autosaving while in realtime because it
            // conflicts with our own autosaving system
            Interface.setAutosaveHiddenState(true);

            socket.onMessage.push(function (evt) {
                verbose(evt.data);

                /*  FIXME this is a problem because we want to move to Netflux
                    and it's not so easy to send custom message types, it seems
                */
                // shortcircuit so chainpad doesn't complain about bad messages
                if (/:\[5000,/.test(evt.data)) { return; }
                realtime.message(evt.data);
            });
            realtime.onMessage(function (message) {
                socket.send(message);
            });

            // package this up into 'setEditable'
            $(textArea).attr("disabled", "disabled");

            realtime.onUserListChange(function (userList) {
                if (initializing && userList.indexOf(userName) > -1) {
                    initializing = false;
                    var userDoc=realtime.getUserDoc();
                    var $textArea=$(textArea);

                    /* RT_event-pre_chain */
                    // addresses http://jira.xwiki.org/browse/RTWIKI-28
                    Saver.setLastSavedContent($textArea.val());
    
                    $textArea.val(userDoc);
                    TextArea.attach($(textArea)[0], realtime);
                    $textArea.removeAttr("disabled");

                    // we occasionally get an out of date document...
                    // http://jira.xwiki.org/browse/RTWIKI-31
                    // createSaver performs a merge on its tail

                    Saver.create(socket, channel, userName, textArea, demoMode, language, messages);
                }
                if (!initializing) {
                    Interface.updateUserList(userName, userListElement, userList, messages);
                }
            });

            debug("Bound websocket");
            realtime.start();
        };
        socket.onclose = function (evt) {
            for (var i = 0; i < socket.onClose.length; i++) {
                if (socket.onClose[i](evt) === false) { return; }
            }
        };
        socket.onmessage = function (evt) {
            for (var i = 0; i < socket.onMessage.length; i++) {
                if (socket.onMessage[i](evt) === false) { return; }
            }
        };
        socket.onerror = function (err) {
            warn(err);
            checkSocket(realtime);
        };

        var to = setInterval(function () {
            checkSocket(realtime);
        }, 500);
        socket.onClose.push(function () {
            clearTimeout(to);
            toolbar.remove();
            Interface.setAutosaveHiddenState(false);
        });

        return socket;
    };

    var stopWebSocket = function (socket) {
        debug("Stopping websocket");
        socket.intentionallyClosing = true;
        if (!socket) { return; }
        if (socket.realtime) { socket.realtime.abort(); }
        socket.close();
    };

    var checkSectionEdit = function () {
        var href = window.location.href;
        if (href.indexOf('#') === -1) { href += '#!'; }
        var si = href.indexOf('section=');
        if (si === -1 || si > href.indexOf('#')) { return false; }
        var m = href.match(/(&*section=[0-9]+)/)[1];
        href = href.replace(m, '');
        if (m[0] === '&') { m = m.substring(1); }
        href = href + '&' + m;
        window.location.href = href;
        return true;
    };

    /*  TODO
        add comments to figure out exactly what this does
        pull out parts that can be reused into realtime-frontend

        move into interface module?
    */
    var editor = function (websocketUrl, userName, messages, channel, demoMode, language) {
        var contentInner = $('#xwikieditcontentinner');
        var textArea = contentInner.find('#content');
        if (!textArea.length) {
            warn("WARNING: Could not find textarea to bind to");
            return;
        }

        if (createPageMode()) { return; }

        if (checkSectionEdit()) { return; }

        Interface.setStyle();

        var checked = (localStorage.getItem(LOCALSTORAGE_DISALLOW)) ? "" : 'checked="checked"';
        var allowRealtimeCbId = uid();

        Interface.createAllowRealtimeCheckbox(allowRealtimeCbId, checked, messages.allowRealtime);

        // TODO replace sockets with netflux
        var socket;
        var checkboxClick = function (checked) {
            if (checked || demoMode) {
                socket = startWebSocket(textArea,
                                        contentInner,
                                        websocketUrl,
                                        userName,
                                        channel,
                                        messages,
                                        demoMode,
                                        language);
            } else if (socket) {
                localStorage.setItem(LOCALSTORAGE_DISALLOW, 1);
                stopWebSocket(socket);
                socket = undefined;
            }
        };

        Section.seekToSection(textArea, function (err) {
            if (err) { throw err; }
            $('#'+allowRealtimeCbId).click(function () { checkboxClick(this.checked); });
            checkboxClick(checked);
        });
    };

    var main = module.exports.main = function (websocketUrl,
                                               userName,
                                               messages,
                                               channel,
                                               demoMode,
                                               language,
                                               config)
    {
        // make the language variable accessible to other functions more easily
        config.language = language;
        mainConfig = config;

        // configure Saver with the merge URL and language settings
        Saver.configure(mainConfig);

        if (!websocketUrl) {
            throw new Error("No WebSocket URL, please ensure Realtime Backend is installed.");
        }

        // Either we are in edit mode or the document is locked.
        // There is no cross-language way that the UI tells us the document is locked
        // but we can hunt for the force button.
        var forceLink = $('a[href$="&force=1"][href*="/edit/"]');

        /*  TODO
                group with lock screen code
                also add 'prependLink' from RTWYSIWYG

            TODO
            move into realtime-frontend
        */
        var hasActiveRealtimeSession = function () {
            forceLink.text(messages.joinSession);
            var link = forceLink.attr('href').replace(/\?(.*)$/, function (all, args) {
                return '?' + args.split('&').filter(function (arg) {
                    if (arg === 'editor=inline') { return false; }
                    if (arg === 'editor=wysiwyg') { return false; }
                    if (arg === 'sheet=CKEditor.EditSheet') { return false; }
                    return true;
                }).join('&');
            });
            forceLink.attr('href', link + '&editor=wiki');
        };

        /*  TODO
            factor into realtime-frontend */
        if (forceLink.length && !localStorage.getItem(LOCALSTORAGE_DISALLOW)) {
            // ok it's locked.
            var socket = new WebSocket(websocketUrl);
            socket.onopen = function (evt) {
                socket.onmessage = function (evt) {
                    verbose("Message! " + evt.data);
                    var regMsgEnd = '3:[0]';
                    if (evt.data.indexOf(regMsgEnd) !== evt.data.length - regMsgEnd.length) {
                        // Not a register message
                    } else if (evt.data.indexOf(userName.length + ':' + userName) === 0) {
                        // It's us registering
                    } else {
                        // Someone has registered
                        debug("hasActiveRealtimeSession");
                        socket.close();
                        hasActiveRealtimeSession();
                    }
                };
                socket.send('1:x' + userName.length + ':' + userName +
                    channel.length + ':' + channel + '3:[0]');
                debug("Bound websocket");
            };
        } else if (window.XWiki.editor === 'wiki' || demoMode) {
            editor(websocketUrl, userName, messages, channel, demoMode, language);
        }
    };

    return module.exports;
});
