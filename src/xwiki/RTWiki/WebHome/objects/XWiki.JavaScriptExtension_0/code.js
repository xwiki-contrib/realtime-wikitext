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

    var info = {
        type: 'rtwiki',
        href: '&editor=wiki&force=1',
        name: "Wiki"
    };

    if (lock) {
        // found a lock link : check active sessions
        Loader.checkSessions(info);
    } else if (window.XWiki.editor === 'wiki' || DEMO_MODE) {
        // No lock and we are using wiki editor : start realtime
        var config = Loader.getConfig();
        var keysData = [
            {doc: config.reference, mod: config.language+'/events', editor: "1.0"},
            {doc: config.reference, mod: config.language+'/content',editor: "rtwiki"}
        ];
        Loader.getKeys(keysData, function(keysResultDoc) {
            var keys = {};
            var keysResult = keysResultDoc[config.reference];
            if(keysResult[config.language+'/events'] && keysResult[config.language+'/events']["1.0"] &&
               keysResult[config.language+'/content'] && keysResult[config.language+'/content']["rtwiki"]) {
                keys.rtwiki = keysResult[config.language+'/content']["rtwiki"].key;
                keys.events = keysResult[config.language+'/events']["1.0"].key;
            }
            if(keys.rtwiki && keys.events) {
                launchRealtime(config, keys);
            }
            else {
                var type = (Object.keys(keys).length === 1) ? Object.keys(keys)[0] : null;
                if(type) {
                    Loader.displayModal(type, info);
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
