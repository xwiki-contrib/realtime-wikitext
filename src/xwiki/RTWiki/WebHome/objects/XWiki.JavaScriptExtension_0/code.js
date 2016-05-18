var DEMO_MODE = "$!request.getParameter('demoMode')" || false;
DEMO_MODE = (DEMO_MODE === true || DEMO_MODE === "true") ? true : false;
var path = "$xwiki.getURL('RTFrontend.LoadEditors','jsx')" + '?minify=false&demoMode='+DEMO_MODE;
var pathErrorBox = "$xwiki.getURL('RTFrontend.ErrorBox','jsx')" + '?';
require([path, pathErrorBox], function(Loader, ErrorBox) {
    // VELOCITY
    #set ($document = $xwiki.getDocument('RTWiki.WebHome'))
    var PATHS = {
        RTWiki_WebHome_realtime_netflux: "$document.getAttachmentURL('realtime-wikitext.js')",
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


    if (lock) {
        // found a lock link : check active sessions
        Loader.checkSessions();
    } else if (window.XWiki.editor === 'wiki' || DEMO_MODE) {
        // No lock and we are using wiki editor : start realtime
        Loader.getKeys(['rtwiki', 'events'], function(keys) {
            var config = Loader.getConfig();

            if(keys.rtwiki && keys.events) {
                launchRealtime(config, keys);
            }
            else {
                var type = (Object.keys(keys).length === 1) ? Object.keys(keys)[0] : null;
                if(type) {
                    Loader.displayModal(type);
                    console.error("You are not allowed to create a new realtime session for that document. Active session : "+Object.keys(keys));
                    console.log("Join that realtime editor if you want to edit this document");
                }
                else {
                    ErrorBox.show('unavailable');
                    console.error("You are not allowed to create a new realtime session for that document.");
                }
            }
        });
    }
});
