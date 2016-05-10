define([
    'RTWiki_ErrorBox',
    'RTFrontend_toolbar',
    'RTFrontend_realtime_input',
    'RTFrontend_cursor',
    'RTFrontend_json_ot',
    'RTFrontend_tests',
    'json.sortify',
    'RTFrontend_text_patcher',
    'RTFrontend_interface',
    'RTFrontend_saver',
    'RTFrontend_chainpad',
    'RTFrontend_diffDOM',
    'jquery'
], function (ErrorBox, Toolbar, realtimeInput, Cursor, JsonOT, TypingTest, JSONSortify, TextPatcher, Interface, Saver, ChainPad) {
    var $ = window.jQuery;
    var DiffDom = window.diffDOM;

    /* REALTIME_DEBUG exposes a 'version' attribute.
        this must be updated with every release */
    var REALTIME_DEBUG = window.REALTIME_DEBUG = {
        version: '1.42',
        local: {},
        remote: {}
    };

    // Create a fake "Crypto" object which will be passed to realtime-input
    var Crypto = {
        encrypt : function(msg, key) { return msg; },
        decrypt : function(msg, key) { return msg; },
        parseKey : function(key) { return {cryptKey : ''}; }
    }

    var stringify = function (obj) {
        return JSONSortify(obj);
    };

    var canonicalize = function(text) { return text.replace(/\r\n/g, '\n'); };

    window.Toolbar = Toolbar;

    var module = window.REALTIME_MODULE = {};

    var main = module.main = function (editorConfig, docKeys) {

        var WebsocketURL = editorConfig.WebsocketURL;
        var userName = editorConfig.userName;
        var DEMO_MODE = editorConfig.DEMO_MODE;
        var language = editorConfig.language;
        var saverConfig = editorConfig.saverConfig || {};
        var Messages = saverConfig.messages || {};

        /** Key in the localStore which indicates realtime activity should be disallowed. */
        var LOCALSTORAGE_DISALLOW = editorConfig.LOCALSTORAGE_DISALLOW;

        var $contentInner = $('#xwikieditcontentinner');
        var $textArea = $('#content');

        var channel = docKeys.rtwiki;
        var eventsChannel = docKeys.events_rtwiki;

        // TOOLBAR style
        var TOOLBAR_CLS = Toolbar.TOOLBAR_CLS;
        var toolbar_style = [
            '<style>',
            '.' + TOOLBAR_CLS + ' {',
            '    width: 100%;',
            '    color: #666;',
            '    font-weight: bold;',
            '    background-color: #f0f0ee;',
            '    border: 0, none;',
            '    height: 24px;',
            '    float: left;',
            '}',
            '.' + TOOLBAR_CLS + ' div {',
            '    padding: 0 10px 0 5px;',
            '    height: 1.5em;',
            '    background: #f0f0ee;',
            '    line-height: 25px;',
            '    height: 24px;',
            '}',
            '</style>'
        ];
        // END TOOLBAR style

        // DISALLOW REALTIME
        var realtimeAllowed = function (bool) {
            if (typeof bool === 'undefined') {
                var disallow = localStorage.getItem(LOCALSTORAGE_DISALLOW);
                if (disallow) {
                    return false;
                } else {
                    return true;
                }
            } else {
                localStorage.setItem(LOCALSTORAGE_DISALLOW, bool? '' : 1);
                return bool;
            }
        };
        var uid = Interface.uid;

        var allowRealtimeCbId = uid();

        var checked = (realtimeAllowed()? 'checked="checked"' : '');
        
        Interface.createAllowRealtimeCheckbox(allowRealtimeCbId, checked, Messages.allowRealtime);
        // hide the toggle for autosaving while in realtime because it
        // conflicts with our own autosaving system
        Interface.setAutosaveHiddenState(true);

        var $disallowButton = $('#' + allowRealtimeCbId);

        var disallowClick = function () {
            var checked = $disallowButton[0].checked;
            //console.log("Value of 'allow realtime collaboration' is %s", checked);
            if (checked || DEMO_MODE) {
                realtimeAllowed(true);
                // TODO : join the RT session without reloading the page?
                window.location.reload();
            } else {
                realtimeAllowed(false);
                module.abortRealtime();
            }
        };

        $disallowButton.on('change', disallowClick);

        if (!realtimeAllowed()) {
            console.log("Realtime is disallowed. Quitting");
            return;
        }
        // DISALLOW REALTIME END

        // configure Saver with the merge URL and language settings
        saverConfig.ErrorBox = ErrorBox;
        Saver.configure(saverConfig, language);

        var $editButtons = $('.buttons');

        console.log("Creating realtime toggle");

        var whenReady = function () {

            var inner = $textArea;
            //var cursor = window.cursor = Cursor(inner);
            var cursor = null;

            var setEditable = module.setEditable = function (bool) {
                $textArea.prop("disabled", !bool);
            };

            // don't let the user edit until the pad is ready
            setEditable(false);


            var initializing = true;
            var userList = {}; // List of pretty name of all users (mapped with their server ID)
            var toolbarList; // List of users still connected to the channel (server IDs)
            var addToUserList = function(data) {
                for (var attrname in data) { userList[attrname] = data[attrname]; }
                if(toolbarList && typeof toolbarList.onChange === "function") {
                    toolbarList.onChange(userList);
                }
            };

            var myData = {};
            var myUserName = ''; // My "pretty name"
            var myID; // My server ID

            var setMyID = function(info) {
              myID = info.myID || null;
              myUserName = myID;
              myData[myID] = {
                name: userName
              };
              addToUserList(myData);
            };

            var stringifyTextarea = function(text) {
              return stringify({
                content: text,
                metadata: {}
              });
            }

            var realtimeOptions = {
                // provide initialstate...
                initialState: stringifyTextarea($textArea.val()) || '{}',

                // the websocket URL
                websocketURL: WebsocketURL,

                // our username
                userName: userName,

                // the channel we will communicate over
                channel: channel,

                // method which allows us to get the id of the user
                setMyID: setMyID,

                // Crypto object to avoid loading it twice in Cryptpad
                crypto: Crypto,

                // really basic operational transform
                transformFunction : JsonOT.validate
            };
            var updateUserList = function(shjson) {
                // Extract the user list (metadata) from the hyperjson
                var hjson = (shjson === "") ? {} : JSON.parse(shjson);
                if(hjson && hjson.metadata) {
                  var userData = hjson.metadata;
                  // Update the local user data
                  addToUserList(userData);
                }
                return hjson;
            }

            var onRemote = realtimeOptions.onRemote = function (info) {
                if (initializing) { return; }

                var oldValue = canonicalize($textArea.val());

                var shjson = info.realtime.getUserDoc();
                var hjson = updateUserList(shjson);
                var newValue = hjson.content || "";

                var op = TextPatcher.diff(oldValue, newValue);

                var elem = $textArea[0];
                var selects = ['selectionStart', 'selectionEnd'].map(function (attr) {
                    return TextPatcher.transformCursor(elem[attr], op);
                });

                $textArea.val(newValue);

                elem.selectionStart = selects[0];
                elem.selectionEnd = selects[1];
            };

            var onInit = realtimeOptions.onInit = function (info) {
                // Create the toolbar
                var $bar = $contentInner;
                toolbarList = info.userList;
                var config = {
                    userData: userList
                    // changeNameID: 'cryptpad-changeName'
                };
                toolbar = Toolbar.create($bar, info.myID, info.realtime, info.getLag, info.userList, config, toolbar_style);

                // this function displays a message notifying users that there was a merge
                Saver.lastSaved.mergeMessage = Interface.createMergeMessageElement(toolbar.toolbar
                    .find('.rtwiki-toolbar-rightside'),
                    saverConfig.messages);
                Saver.setLastSavedContent($textArea.val());
                var textConfig = {
                  formId: "edit", // Id of the wiki page form
                  isHTML: false, // If text content is HTML (Wysiwyg), it has to be converted before the merge
                  setTextValue: function(newText, callback) {
                      $textArea.val(newText);
                      callback();
                  },
                  getTextValue: function() { return $textArea.val(); },
                  messages: saverConfig.messages
                }
                Saver.create(info.network, eventsChannel, info.realtime, textConfig, DEMO_MODE);
            };

            var onReady = realtimeOptions.onReady = function (info) {
                var realtime = module.realtime = info.realtime;
                module.leaveChannel = info.leave;
                module.patchText = TextPatcher.create({
                    realtime: realtime,
                    logging: false,
                });

                var userDoc = module.realtime.getUserDoc();
                var hjson = updateUserList(userDoc);

                var newDoc = "";
                if(userDoc !== "") {
                    newDoc = hjson.content;
                }

                $textArea.val(newDoc);

                console.log("Unlocking editor");
                initializing = false;
                setEditable(true);

                onLocal();
            };

            var onAbort = realtimeOptions.onAbort = function (info) {
                console.log("Aborting the session!");
                // TODO inform them that the session was torn down
                toolbar.failed();
                toolbar.toolbar.remove();
            };

            var onLocal = realtimeOptions.onLocal = function () {
                if (initializing) { return; }

                // serialize your DOM into an object
                var textValue = canonicalize($textArea.val());
                var obj = {content: textValue};

                // append the userlist to the hyperjson structure
                obj.metadata = userList;

                // stringify the json and send it into chainpad
                var shjson = stringify(obj);
                module.patchText(shjson);

                Saver.setLocalEditFlag(true);

                if (module.realtime.getUserDoc() !== shjson) {
                    console.error("realtime.getUserDoc() !== shjson");
                    module.patchText(shjson, true);
                }
            };

            var rti = module.realtimeInput = realtimeInput.start(realtimeOptions);
            module.abortRealtime = function () {
                module.realtime.abort();
                module.leaveChannel();
                onAbort();
            };

            $textArea.on('change keyup', onLocal);
        };

        whenReady();
    };

    return module;
});
