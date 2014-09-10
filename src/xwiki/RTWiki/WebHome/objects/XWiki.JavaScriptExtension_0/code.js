;(function() {
    // VELOCITY
    var WEBSOCKET_URL = "$!services.websocket.getURL('realtime')";
    var USER = "$!xcontext.getUserReference()" || "xwiki:XWiki.XWikiGuest";
    var PRETTY_USER = "$xwiki.getUserName($xcontext.getUser(), false)";
    var DEMO_MODE = "$!request.getParameter('demoMode')" || false;
    var DEFAULT_LANGUAGE = "$xwiki.getXWikiPreference('default_language')";
    var MESSAGES = {
        allowRealtime: "Allow Realtime Collaboration", // TODO: translate
        joinSession: "Join Realtime Collaborative Session",

        disconnected: "Disconnected",
        myself: "Myself",
        guest: "Guest",
        guests: "Guests",
        and: "and",
        editingWith: "Editing With:",
        initializing: "Initializing...",

        lag: "Lag:"
    };
    var PATHS = {
        RTWiki_WebHome_chainpad: "$doc.getAttachmentURL('chainpad.js')",
        RTWiki_WebHome_sharejs_textarea: "$doc.getAttachmentURL('sharejs_textarea.js')",
        RTWiki_WebHome_rtwiki: "$doc.getAttachmentURL('rtwiki.js')",
        RTWiki_ErrorBox: "$xwiki.getURL('RTWiki.ErrorBox','jsx')" + '?minify=false',
        RTWiki_GetKey: "$xwiki.getURL('RTWiki.GetKey','jsx')" + '?minify=false'
    };
    // END_VELOCITY

    for (var path in PATHS) { PATHS[path] = PATHS[path].replace(/\.js$/, ''); }
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

    require(['jquery', 'RTWiki_WebHome_rtwiki', 'RTWiki_GetKey'], function ($, RTWiki, channel) {

        var language = $('form#edit input[name="language"]').attr('value');
        if (language === '' || language === 'default') { language = DEFAULT_LANGUAGE; }

        RTWiki.main(WEBSOCKET_URL, userName, MESSAGES, channel.key+'-rtwiki', DEMO_MODE, language);
    });
}());
