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
        RTWiki_WebHome_diff:"$doc.getAttachmentURL('diff.js')",
        RTWiki_ErrorBox: "$xwiki.getURL('RTWiki.ErrorBox','jsx')" + '?minify=false',
        RTWiki_GetKey: "$xwiki.getURL('RTWiki.GetKey','jsx')"
    };
    var CONFIG = {
        ajaxMergeUrl : "$xwiki.getURL('RTWiki.Ajax','get')",
        ajaxVersionUrl : "$xwiki.getURL('RTWiki.Version','get')"
    };
    // END_VELOCITY

    var wiki = encodeURIComponent(XWiki.currentWiki);
    var space = encodeURIComponent(XWiki.currentSpace);
    var page = encodeURIComponent(XWiki.currentPage);
    PATHS.RTWiki_GetKey += '?minify=false&wiki=' + wiki + '&space=' + space + '&page=' + page;

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

    require(['jquery', 'RTWiki_WebHome_rtwiki', 'RTWiki_GetKey'], function ($, RTWiki, key) {

        if (key.error !== 'none') { throw new Error("channel key is not right: [" + key + "]"); }
        // This is a hack to get the language of the document
        // which is not strictly possible due to XWIKI-12685
        var lang = $('form#edit input[name="language"]').attr('value') || $('html').attr('lang');
        if (lang === '' || lang === 'default') { lang = DEFAULT_LANGUAGE; }
        var channel = key.key + lang + '-rtwiki';
        RTWiki.main(WEBSOCKET_URL, userName, MESSAGES, channel, DEMO_MODE, lang, CONFIG);
    });
}());
