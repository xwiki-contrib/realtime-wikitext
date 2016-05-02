;(function() {
    // VELOCITY
    var WEBSOCKET_URL = "$!services.websocket.getURL('realtimeNetflux')";
    var USER = "$!xcontext.getUserReference()" || "xwiki:XWiki.XWikiGuest";
    var PRETTY_USER = "$xwiki.getUserName($xcontext.getUser(), false)";
    var DEMO_MODE = "$!request.getParameter('demoMode')" || false;
    var DEFAULT_LANGUAGE = "$xwiki.getXWikiPreference('default_language')";
    var LOCALSTORAGE_DISALLOW = 'rtwysiwyg-disallow';
    var MESSAGES = {
        allowRealtime: "Allow Realtime Collaboration", // TODO: translate
        joinSession: "Join Realtime Collaborative Session",

        wikiSessionInProgress: "A Realtime <strong>Wiki</strong> Editor session is in progress:",

        disconnected: "Disconnected",
        myself: "Myself",
        guest: "Guest",
        guests: "Guests",
        and: "and",
        editingWith: "Editing With:",
        initializing: "Initializing...",

        lag: "Lag:",
        saved: "Saved: v{0}",
        'merge overwrite': "Overwrote the realtime session's content with the latest saved state",
        savedRemote: 'v{0} saved by {1}',
        conflictResolved: 'merge conflict resolved remotely, now v{0}',
        mergeDialog_prompt: "A change was made to the document outside of the realtime session, "+
            "and the server had difficulty merging it with your version. "+
            "How would you like to handle this?",
        mergeDialog_keepRealtime: "Overwrite all changes with the current realtime version",
        mergeDialog_keepRemote:   "Overwrite all changes with the current remote version"
    };

    #set ($document = $xwiki.getDocument('RTFrontend.WebHome'))
    var PATHS = {
        RTWiki_realtime_netflux: "$doc.getAttachmentURL('realtime-wikitext.js')",
        RT_toolbar: "$doc.getAttachmentURL('toolbar.js')",
        RTWiki_ErrorBox: "$xwiki.getURL('RTWiki.ErrorBox','jsx')" + '?minify=false',

        RTFrontend_chainpad: "$document.getAttachmentURL('chainpad.js')",
        RTFrontend_realtime_input: "$document.getAttachmentURL('realtime-input.js')",

        RTFrontend_saver: "$document.getAttachmentURL('saver.js')",
        RTFrontend_interface: "$document.getAttachmentURL('interface.js')",

        RTFrontend_cursor: "$document.getAttachmentURL('cursor.js')",
        RTFrontend_json_ot: "$document.getAttachmentURL('json-ot.js')",

        RTFrontend_hyperjson: "$document.getAttachmentURL('hyperjson.js')",
        RTFrontend_hyperscript: "$document.getAttachmentURL('hyperscript.js')",

        RTFrontend_diffDOM: "$document.getAttachmentURL('diffDOM.js')",

        RTFrontend_treesome: "$document.getAttachmentURL('treesome.js')",
        RTFrontend_messages: "$document.getAttachmentURL('messages.js')",
        RTFrontend_promises: "$document.getAttachmentURL('es6-promise.min.js')",
        'json.sortify': "$document.getAttachmentURL('JSON.sortify.js')",
        RTFrontend_netflux: "$document.getAttachmentURL('netflux-client.js')",
        RTFrontend_text_patcher: "$document.getAttachmentURL('TextPatcher.js')",
        RTFrontend_tests: "$document.getAttachmentURL('TypingTests.js')",
        RTFrontend_rangy: "$document.getAttachmentURL('rangy-core.min.js')",

        RTFrontend_GetKey: "$xwiki.getURL('RTFrontend.GetKey','jsx')"
    };
    var CONFIG = {
        ajaxMergeUrl : "$xwiki.getURL('RTWiki.Ajax','get')",
        ajaxVersionUrl : "$xwiki.getURL('RTWiki.Version','get')"
    };
    // END_VELOCITY

    var wiki = encodeURIComponent(XWiki.currentWiki);
    var space = encodeURIComponent(XWiki.currentSpace);
    var page = encodeURIComponent(XWiki.currentPage);
    PATHS.RTFrontend_GetKey = PATHS.RTFrontend_GetKey.replace(/\.js$/, '')+'?minify=false&wiki=' + wiki + '&space=' + space + '&page=' + page;

    for (var path in PATHS) { PATHS[path] = PATHS[path].replace(/\.js$/, ''); }
    //for (var path in PATHS) { PATHS[path] = PATHS[path] + '?cb='+(new Date()).getTime(); }
    require.config({paths:PATHS});

    if (!window.XWiki) {
        console.log("WARNING: XWiki js object not defined.");
        return;
    }

    // Not in edit mode?
    if (!DEMO_MODE && window.XWiki.contextaction !== 'edit') { return; }

    // Username === <USER>-encoded(<PRETTY_USER>)%2d<random number>
    var userName = USER + '-' + encodeURIComponent(PRETTY_USER + '-').replace(/-/g, '%2d') +
        String(Math.random()).substring(2);

    /*require(['jquery', 'RTWiki_WebHome_rtwiki', 'RTWiki_GetKey'], function ($, RTWiki, key) {

        if (key.error !== 'none') { throw new Error("channel key is not right: [" + key + "]"); }
        // This is a hack to get the language of the document
        // which is not strictly possible due to XWIKI-12685
        var lang = $('form#edit input[name="language"]').attr('value') || $('html').attr('lang');
        if (lang === '' || lang === 'default') { lang = DEFAULT_LANGUAGE; }
        var channel = key.key + lang + '-rtwiki';
        RTWiki.main(WEBSOCKET_URL, userName, MESSAGES, channel, DEMO_MODE, lang, CONFIG);
    });*/
    var makeConfig = function () {
        var languageSelector = document.querySelectorAll('form input[name="language"]');// [0].value;

        var language = languageSelector[0] && languageSelector[0].value;

        if (!language || language === 'default') { language = DEFAULT_LANGUAGE; }

        // Username === <USER>-encoded(<PRETTY_USER>)%2d<random number>
        var userName = USER + '-' + encodeURIComponent(PRETTY_USER + '-').replace(/-/g, '%2d') +
            String(Math.random()).substring(2);

        return {
            saverConfig: {
                ajaxMergeUrl: "$xwiki.getURL('RTWiki.Ajax','get')",
                ajaxVersionUrl: "$xwiki.getURL('RTWiki.Version','get')",
                messages: MESSAGES
            },
            websocketURL: WEBSOCKET_URL,
            userName: userName,
            language: language
        };
    };
    var launchRealtime = function (config) {
        require(['jquery', 'RTWiki_realtime_netflux', 'RTFrontend_GetKey'], function ($, RTWysiwyg, key) {
            if (RTWysiwyg && RTWysiwyg.main) {
                if (key.error !== 'none') { throw new Error("channel key is not right: [" + key + "]"); }
                var channel = key.key + config.language + '-rtwiki';
                RTWysiwyg.main(config.websocketURL, config.userName, MESSAGES, channel, DEMO_MODE, config.language, config.saverConfig);
            } else {
                console.error("Couldn't find RTWysiwyg.main, aborting");
            }
        });
    };

    // Get Key CODE
    // used to insert some descriptive text before the lock link
    var prependLink = function (link, text) {
        var p = document.createElement('p');
        p.innerHTML = text;
        link.parentElement.insertBefore(p, link);
    };
    var getDocLock = function () {
        var force = document.querySelectorAll('a[href*="force=1"][href*="/edit/"]');
        return force.length? force[0] : false;
    };
    var pointToRealtime = function (link) {
        var href = link.getAttribute('href');

        href = href.replace(/\?(.*)$/, function (all, args) {
            return '?' + args.split('&').filter(function (arg) {
                if (arg === 'editor=wysiwyg') { return false; }
                if (arg === 'editor=wiki') { return false; }
                if (arg === 'sheet=CKEditor.EditSheet') { return false; }
                if (arg === 'force=1') { return false; }
            }).join('&');
        });

        href = href + '&editor=wiki&force=1';
        link.setAttribute('href', href);
        link.innerText = MESSAGES.joinSession;

        prependLink(link, MESSAGES.wikiSessionInProgress);
    };
    var checkSocket = function (config, callback) {
        require(['RTFrontend_GetKey'], function (key) {
            if (key.error !== 'none') { throw new Error("channel key is not right: [" + key + "]"); }
            var channel = key.key + config.language + '-rtwiki';
            var socket = new WebSocket(config.websocketURL);
            socket.onopen = function (evt) {
                var state = 0;
                var userCount = 0;
                var uid;
                socket.onmessage = function (evt) {
                    var msg = JSON.parse(evt.data);
                    if(state === 0 && msg[2] === "IDENT") {
                        uid = msg[3];
                        var joinMsg = [1, "JOIN", channel];
                        socket.send(JSON.stringify(joinMsg));
                        state = 1;
                        return;
                    }
                    if(state === 1 && msg[1] === "JACK" && msg[2] === channel) {
                        state = 2;
                        return;
                    }
                    if(state === 2 && msg[2] === "JOIN" && msg[3] === channel) {
                        if(msg[1] ===  uid) {
                            // If no other user : create the RT channel
                            if(userCount === 0) {
                                socket.close();
                                callback(false);
                            }
                            // If there is at least one user in the channel
                            else {
                                socket.close();
                                callback(true);
                            }
                            return;
                        }
                        // Count only users with a 32 chars name. The history keeper is a fake user with a 16 chars name.
                        userCount += (msg[1].length === 32) ? 1 : 0;
                    }
                };
            };
        });
    };
    var lock = getDocLock();
    var realtimeDisallowed = function () {
        return localStorage.getItem(LOCALSTORAGE_DISALLOW)?  true: false;
    };
    var config = makeConfig();
    if (lock) {
        // found a lock link

        //console.log("Found a lock on the document!");
        checkSocket(config, function (active) {
            // determine if it's a realtime session
            if (active) {
                console.log("Found an active realtime");
                if (realtimeDisallowed()) {
                    // do nothing
                } else {
                    pointToRealtime(lock);
                }
            } else {
                console.log("Couldn't find an active realtime session");
            }
        });
    } else if (window.XWiki.editor === 'wiki' || DEMO_MODE) {
        // using CKEditor and realtime is allowed: start the realtime
        launchRealtime(config);
    }
    //End Get Key Code
}());
