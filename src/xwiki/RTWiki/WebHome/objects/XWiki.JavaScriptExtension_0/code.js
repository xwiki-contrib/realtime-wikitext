var DEMO_MODE = "$!request.getParameter('demoMode')" || false;
DEMO_MODE = (DEMO_MODE === true || DEMO_MODE === "true") ? true : false;
var path = "$xwiki.getURL('RTFrontend.LoadEditors','jsx')" + '?minify=false&demoMode='+DEMO_MODE;
require([path], function(Loader) {
    // VELOCITY
    #set ($document = $xwiki.getDocument('RTWiki.WebHome'))
    var PATHS = {
        RTWiki_WebHome_realtime_netflux: "$document.getAttachmentURL('realtime-wikitext.js')",
        RTWiki_ErrorBox: "$xwiki.getURL('RTWiki.ErrorBox','jsx')" + '?minify=false',
    };
    // END_VELOCITY

    for (var path in PATHS) { PATHS[path] = PATHS[path].replace(/\.js$/, ''); }
    require.config({paths:PATHS});


    var launchRealtime = function (config, keys) {
        require(['jquery', 'RTWiki_WebHome_realtime_netflux'], function ($, RTWiki) {
            if (RTWiki && RTWiki.main) {
                RTWiki.main(config, keys);
            } else {
                console.error("Couldn't find RTWiki.main, aborting");
            }
        });
    };

    var getDocLock = function () {
        var force = document.querySelectorAll('a[href*="force=1"][href*="/edit/"]');
        return force.length? force[0] : false;
    };
    var lock = getDocLock();

    var config = Loader.getConfig();

    var realtimeDisallowed = function () {
        return localStorage.getItem(config.LOCALSTORAGE_DISALLOW)?  true: false;
    };

    if (lock) {
        // found a lock link : check active sessions
        Loader.checkSessions();
    } else if (window.XWiki.editor === 'wiki' || config.DEMO_MODE) {
        // No lock and we are using wiki editor : start realtime
        Loader.getKeys(['rtwiki', 'events'], function(keys) {
            launchRealtime(config, keys);
        });
    }
});
