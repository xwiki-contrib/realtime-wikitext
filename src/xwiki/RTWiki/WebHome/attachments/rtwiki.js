define([
  'jquery',
  'RTWiki_WebHome_sharejs_textarea',
  'RTWiki_ErrorBox',
  'RTWiki_WebHome_chainpad'
], function($, TextArea, ErrorBox) {

    var ChainPad = window.ChainPad;
    var module = { exports: {} };

    var LOCALSTORAGE_DISALLOW = 'rtwiki-disallow';

    // Number for a message type which will not interfere with chainpad.
    var MESSAGE_TYPE_ISAVED = 5000;

    // how often to check if the document has been saved recently
    var SAVE_DOC_CHECK_CYCLE = 20000;

    // how often to save the document
    // TODO http://jira.xwiki.org/browse/RTWIKI-45
    // make this non-constant, and based upon the current number of rt-users
    var SAVE_DOC_TIME = 60000;

    // How long to wait before determining that the connection is lost.
    var MAX_LAG_BEFORE_DISCONNECT = 30000;

    // we can't avoid putting this in a very high scope, because lots of things
    // rely on it. Modify with extreme caution and avoid race conditions
    var mainConfig;

    var lastSaved = {
        content: '',
        version: $('html').data('xwiki-version'),
        time: 0,
        // http://jira.xwiki.org/browse/RTWIKI-37
        hasModifications: false,
        // for future tracking of 'edited since last save'
        // only show the merge dialog to those who have edited
        wasEditedLocally: false
    };
    
    var warn = function (x) {};
    var debug = function (x) {};
    // there was way too much noise, if you want to know everything use verbose
    var verbose = function (x) {};
    //verbose = function (x) { console.log(x); };
    debug = function (x) { console.log(x) };
    warn = function (x) { console.log(x) };

    var setStyle = function () {
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
            '</style>'
         ].join(''));
    };

    var uid = function () {
        return 'rtwiki-uid-' + String(Math.random()).substring(2);
    };

    var updateUserList = function (myUserName, listElement, userList, messages) {
        var meIdx = userList.indexOf(myUserName);
        if (meIdx === -1) {
            listElement.text(messages.disconnected);
            return;
        }
        var userMap = {};
        userMap[messages.myself] = 1;
        userList.splice(meIdx, 1);
        for (var i = 0; i < userList.length; i++) {
            var user;
            if (userList[i].indexOf('xwiki:XWiki.XWikiGuest') === 0) {
                if (userMap.Guests) {
                    user = messages.guests;
                } else {
                    user = messages.guest;
                }
            } else {
                user = userList[i].replace(/^.*-([^-]*)%2d[0-9]*$/, function(all, one) {
                    return decodeURIComponent(one);
                });
            }
            userMap[user] = userMap[user] || 0;
            if (user === messages.guest && userMap[user] > 0) {
                userMap.Guests = userMap[user];
                delete userMap[user];
                user = messages.guests;
            }
            userMap[user]++;
        }
        var userListOut = [];
        for (var name in userMap) {
            if (userMap[name] > 1) {
                userListOut.push(userMap[name] + " " + name);
            } else {
                userListOut.push(name);
            }
        }
        if (userListOut.length > 1) {
            userListOut[userListOut.length-1] =
                messages.and + ' ' + userListOut[userListOut.length-1];
        }
        listElement.text(messages.editingWith + ' ' + userListOut.join(', '));
    };

    var createUserList = function (realtime, myUserName, container, messages) {
        var id = uid();
        $(container).prepend('<div class="rtwiki-userlist" id="'+id+'"></div>');
        var listElement = $('#'+id);
        return listElement;
    };

    var checkLag = function (realtime, lagElement, messages) {
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

    var createLagElement = function (socket, realtime, container, messages) {
        var id = uid();
        $(container).append('<div class="rtwiki-lag" id="'+id+'"></div>');
        var lagElement = $('#'+id);
        var intr = setInterval(function () {
            checkLag(realtime, lagElement, messages);
        }, 3000);
        socket.onClose.push(function () { clearTimeout(intr); });
        return lagElement;
    };

    var createRealtimeToolbar = function (container) {
        var id = uid();
        $(container).prepend(
            '<div class="rtwiki-toolbar" id="' + id + '">' +
                '<div class="rtwiki-toolbar-leftside"></div>' +
                '<div class="rtwiki-toolbar-rightside"></div>' +
            '</div>'
        );
        return $('#'+id);
    };

    var createMergeMessageElement = function (container,messages) {
        var id = uid();
        $(container).prepend( '<div class="rtwiki-merge" id="'+id+'"></div>');
        var $merges = lastSaved.messageElement = $('#'+id);

        var timeout;

        // drop a method into the lastSaved object which handles messages
        lastSaved.mergeMessage = function (msg_type, msg) {
            // keep multiple message sequences from fighting over resources
            timeout && clearTimeout(timeout);

            // set the message, handle all types
            $merges.html(messages[msg_type]+msg);
      
            // clear the message box in five seconds
            // 1.5s message fadeout time
            timeout = setTimeout(function () {
                $merges.fadeOut(1500, function () {
                    $merges.html('');
                    $merges.show();
                });
            },5000);
        };
        return $merges;
    };

    var now = function () { return (new Date()).getTime(); };

    var getFormToken = function () {
        return $('meta[name="form_token"]').attr('content');
    };

    var getDocumentSection = function (sectionNum, andThen) {
        debug("getting document section...");
        $.ajax({
            url: window.docediturl,
            type: "POST",
            async: true,
            dataType: 'text',
            data: {
                xpage: 'editwiki',
                section: ''+sectionNum
            },
            success: function (jqxhr) {
                var content = $(jqxhr).find('#content');
                if (!content || !content.length) {
                    andThen(new Error("could not find content"));
                } else {
                    andThen(undefined, content.text());
                }
            },
            error: function (jqxhr, err, cause) {
                andThen(new Error(err));
            }
        });
    };

    var getIndexOfDocumentSection = function (documentContent, sectionNum, andThen) {
        getDocumentSection(sectionNum, function (err, content) {
            if (err) {
                andThen(err);
                return;
            }
            // This is screwed up, XWiki generates the section by rendering the XDOM back to
            // XWiki2.0 syntax so it's not possible to find the actual location of a section.
            // See: http://jira.xwiki.org/browse/XWIKI-10430
            var idx = documentContent.indexOf(content);
            if (idx === -1) {
                content = content.split('\n')[0];
                idx = documentContent.indexOf(content);
            }
            if (idx === -1) {
                warn("Could not find section content..");
            } else if (idx !== documentContent.lastIndexOf(content)) {
                warn("Duplicate section content..");
            } else {
                andThen(undefined, idx);
                return;
            }
            andThen(undefined, 0);
        });
    };

    var seekToSection = function (textArea, andThen) {
        var sect = window.location.hash.match(/^#!([\W\w]*&)?section=([0-9]+)/);
        if (!sect || !sect[2]) {
            andThen();
            return;
        }
        var text = $(textArea).text();
        getIndexOfDocumentSection(text, Number(sect[2]), function (err, idx) {
            if (err) { andThen(err); return; }
            if (idx === 0) {
                warn("Attempted to seek to a section which could not be found");
            } else {
                var heightOne = $(textArea)[0].scrollHeight;
                $(textArea).text(text.substring(idx));
                var heightTwo = $(textArea)[0].scrollHeight;
                $(textArea).text(text);
                $(textArea).scrollTop(heightOne - heightTwo);
            }
            andThen();
        })
    };

    /* retrieves attributes about the local document for the purposes of ajax merge
        just data-xwiki-document and lastSaved.version
    */

    var getDocumentStatistics = function () {
        var $html = $('html'),
            fields = [
// 'wiki', 'space', 'page',
                'document'
            ],
            result = {};

        /*  we can't rely on people pushing the new lastSaved.version
            if they quit before ISAVED other clients won't get the new version
            this isn't such an issue, because they _will_ converge eventually
        */
        result.version = lastSaved.version;

        fields.forEach(function (field) {
            result[field] = $html.data('xwiki-'+field);
        });
        return result;    
    };

    var ajaxMerge = function (textArea, cb) {
        var url = mainConfig.ajaxMergeUrl + '?xpage=plain&outputSyntax=plain';

        /* version, document */
        var stats=getDocumentStatistics();

        stats.content = $(textArea).val();

        $.ajax({
            url: url,
            method: 'POST',
            success: function (data) {
                try {
                    var merge=JSON.parse(data);
                    var error = merge.conflicts &&
                        merge.conflicts.length &&
                        merge.conflicts[0].formattedMessage;
                    if (error) {
                        merge.error=error;
                        cb(error, merge);
                    } else {
                        // let the callback handle textarea writes
                        cb(null,merge);
                    }
                } catch (err) {
                    ErrorBox.show('parse');
                    warn(err);
                    cb(err, data);
                }
            },
            data: stats,
            error: function (err) {
                warn(err);
                cb(err,null);
            },
        });
    };

    // check a serverside api for the version string of the document
    var ajaxVersion = function (cb) {
        var url = mainConfig.ajaxVersionUrl + '?xpage=plain&outputSyntax=plain';
        var stats = getDocumentStatistics();
        $.ajax({
            url: url,
            method: 'POST',
            dataType: 'json',
            success: function (data) {
                cb(data.error||null, data);
            },
            data: stats,
            error: function (err) {
                cb(err, null);
            }
        });
    };

    // http://jira.xwiki.org/browse/RTWIKI-29
    var saveDocument = function (textArea, language, andThen) {
        /* RT_event-on_save */
        debug("saving document...");
        $.ajax({
            url: window.docsaveurl,
            type: "POST",
            async: true,
            dataType: 'text',
            
            // http://jira.xwiki.org/browse/RTWIKI-36
            // don't worry about hijacking and resuming
            // if you can just add the usual fields to this, simply steal the event
            data: {
                title: $('#xwikidoctitleinput').val(),
                xredirect: '',
                content: $(textArea).val(),
                xeditaction: 'edit',
                comment: 'Auto-Saved by Realtime Session',
                action_saveandcontinue: 'Save & Continue',
                minorEdit: 1,
                ajax: true,
                form_token: getFormToken(),
                language: language
            },
            success: function () {
                andThen();
            },
            error: function (jqxhr, err, cause) {
                warn(err);
                // Don't callback, this way in case of error we will keep trying.
                //andThen();
            }
        });
    };

    /*
        @param socket
        @param channel
        @param myUserName
        @param toSave : a string to pass
        @param cb : a callback to be executed on save
        @return an anonymous function to be used as a callback
            for when we are actually ready for our content to be saved.
    */

    var saveMessage=function (socket, channel, myUserName, toSave, version) {
        debug("saved document"); // RT_event-on_save
        /*
            FIXME RTWIKI-34
            this may not have been working correctly until now.
            chainpad throws an error on unrecognized message types
                chainpad.js line 461 
            MESSAGE_TYPE_ISAVED is triggering this behaviour now,
            but it didn't seem to do so before...
        */
        var saved = JSON.stringify([MESSAGE_TYPE_ISAVED, version]);
        // show(saved(version))
        lastSaved.mergeMessage('saved', version);
        socket.send('1:x' +
            myUserName.length + ':' + myUserName +
            channel.length + ':' + channel +
            saved.length + ':' + saved
        );
    };

    /**
     * If we are editing a page which does not exist and creating it from a template
     * then we should not auto-save the document otherwise it will cause RTWIKI-16
     */
    var createPageMode = function () {
        return (window.location.href.indexOf('template=') !== -1);
    };

    var presentMergeDialog = function(question, labelDefault, choiceDefault, labelAlternative, choiceAlternative){
        var behave = {
           onYes: choiceDefault,
           onNo: choiceAlternative
        };

        var param = {
            confirmationText: question,
            yesButtonText: labelDefault,
            noButtonText: labelAlternative
        };

        new XWiki.widgets.ConfirmationBox(behave, param);
    };

    /*
        createSaver contains some of the more complicated logic in this script
        clients check for remote changes on random intervals

        if another client has saved outside of the realtime session, changes
        are merged on the server using XWiki's threeway merge algo.

        The changes are integrated into the local textarea, which replicates
        across realtime sessions.

        if the resulting state does not match the last saved content, then the
        contents are saved as a new version.

        Other members of the session are notified of the save, and the 
        resulting new version. They then update their local state to match.

        During this process, a series of checks are made to reduce the number
        of unnecessary saves, as well as the number of unnecessary merges.
    */
    var createSaver = function (socket, channel, myUserName, textArea, demoMode, language, messages) {
        lastSaved.time = now();
        var hasTripped = false;
        var mergeDialogCurrentlyDisplayed = false;
        socket.onMessage.unshift(function (evt) {
            // get the content...
            var chanIdx = evt.data.indexOf(channel);
            var content = evt.data.substring(evt.data.indexOf(':[', chanIdx + channel.length)+1);

            // parse
            var json = JSON.parse(content);

            // not an isaved message
            if (json[0] !== MESSAGE_TYPE_ISAVED) { return; }

            // hack to ignore the rest of this block on load
            // FIXME
            if (!hasTripped) {
                hasTripped = true;
                return;
            }
                /* RT_event-on_isave_receive */
            if (lastSaved.version !== json[1]) {
                debug("A remote client saved and incremented the latest common ancestor");
                // update the local latest Common Ancestor version string
                lastSaved.version = json[1];

                // http://jira.xwiki.org/browse/RTWIKI-34
                lastSaved.mergeMessage('savedRemote', json[1]);

                // remember the state of the textArea when last saved
                // so that we can avoid additional minor versions
                // there's a *tiny* race condition here
                // but it's probably not an issue
                lastSaved.content = $(textArea).val();
            }
            lastSaved.time = now();
            return false;
        });

        var saveRoutine = function () {
            var toSave = $(textArea).val();
            if (lastSaved.content === toSave) { 
                verbose("No changes made since last save. "+
                    "Avoiding unnecessary commits");
                return;
            }

            /*
                routine should be as follows:
                    1. merge
                      + freezing is an API we should have
                      + merge will return an attibute 'conflicts' which should be zero
                        - else display a dialog
                          - if you are displaying a dialog, first warn your friends
                          - this requires an EVERYBODY_HOLD_ON_MESSAGE_TYPE
                          - if the person who sent the EVERYBODY_HOLD_ON message disconnects, then the other clients should resume
                          - we can also send this message type for other events
                    2. push changes to textArea
                    3. save document
                      + flip a dirty flag to avoid multiple 
                      + check if api returned a version string, if so skip next step
                    4. get document version
                    5. push version to ISAVED
                      + chainpad is complaining
                      + if you receive ISAVED, drop everything
            */

            // post your current version to the server to see if it must merge

            // remember the current state so you can check if it has changed.
            var preMergeContent = $(textArea).val();
            ajaxMerge(textArea, function (err, merge) {
                if (err) { 
                    if (typeof merge === 'undefined') {
                        warn("The ajax merge API did not return an object. Something went wrong");
                        warn(err);
                        return;
                    } else if (err === merge.error) { // there was a merge error
                        // continue and handle elsewhere
                        warn(err);
                    } else {
                        // it was some other kind of error... parsing?
                        // complain and return. this means the script failed
                        warn(err);
                        return;
                    }
                }

                toSave = merge.content;
                if (toSave === lastSaved.content) {
                    verbose("Merging didn't result in a change.");
                    return;
                }

                var $textArea = $(textArea);

                var bumpVersion = function (toSave, cb) {
                    ajaxVersion(function (e, out) {
                        if (out) {
                            debug("Triggering lastSaved refresh on remote clients");
                            lastSaved.version = out.version;
                            saveMessage(socket, channel, myUserName, toSave, lastSaved.version);
                            cb && cb(out);
                        }
                    });
                };

                // prepare the continuation that multiple branches will use
                var continuation = function () {
                    if (merge.saveRequired) {
                        toSave = $textArea.val();
                        saveDocument(textArea, language, function () {
                            lastSaved.time = now();
                            lastSaved.content = toSave;

                            // cache this because bumpVersion will increment it
                            var lastVersion = lastSaved.version;

                            // get document version
                            bumpVersion(toSave, function(out){ 
                                debug("Version bumped from " + lastVersion +
                                    " to "+ out.version+".");
                                lastSaved.mergeMessage('saved',out.version);
                            });
                        });
                    } else {
                        // local content matches that of the latest version
                        verbose("No save was necessary");
                        lastSaved.content = toSave;
                        // inform other clients, possibly via ISAVED
                        // with current version as argument to reset lastSaved
                        bumpVersion(toSave);
                    }
                };

                // http://jira.xwiki.org/browse/RTWIKI-34
                // Give Messages when merging
                if (merge.merged) {
                    // a merge took place
                    if (merge.error) {
                        // but there was a conflict we'll need to resolve.
                        warn(merge.error)

                        // halt the autosave cycle to give the user time
                        // don't halt forever though, because you might
                        // disconnect and hang

                        mergeDialogCurrentlyDisplayed = true;
                        // FIXME this should all be translatable...
                        presentMergeDialog(
                            messages.mergeDialog_prompt,

                            messages.mergeDialog_keepRealtime,
                            function () {
                                debug("User chose to use the realtime version!");
                                // unset the merge dialog flag
                                mergeDialogCurrentlyDisplayed = false;
                                continuation();
                            },

                            messages.mergeDialog_keepRemote,
                            function () { 
                                debug("User chose to use the remote version!");
                                // unset the merge dialog flag
                                mergeDialogCurrentlyDisplayed = false;

                                $.ajax({
                                    url: XWiki.currentDocument.getRestURL()+'?media=json',
                                    method: 'GET',
                                    dataType: 'json',
                                    success: function (data) {
                                        $textArea.val(data.content);
                                        debug("Overwrote the realtime session's content with the latest saved state");
                                        bumpVersion(function () {
                                            lastSaved.mergeMessage('merge overwrite','');
                                        });
                                    },
                                    error: function (err) {
                                        warn("Encountered an error while fetching remote content");
                                        warn(err);
                                    }
                                });
                            }
                        );
                        return; // escape from the save process
                        // when the merge dialog is answered it will continue
                    } else {
                        // there were no errors
                        if (preMergeContent !== $textArea.val()) {
                            /* but there have been changes since merging
                                don't overwrite if there have been changes while merging
                                http://jira.xwiki.org/browse/RTWIKI-37 */
                            return; // try again in one cycle
                        } else {
                            // there were no errors or local changes push to the textarea
                            $textArea.val(toSave);
                            // bump sharejs to force propogation. only if changed
                            socket.realtime.bumpSharejs();
                            // TODO show message informing the user which versions were merged...

                            // continue the save process
                            continuation();
                        }
                    }
                } else {
                    // no merge was necessary, but you might still have to save
                    continuation();
                }
            });
        }

        // TimeOut
        var to;

        var check = function () {
            if (to) { clearTimeout(to); }
            verbose("createSaver.check");
            to = setTimeout(check, Math.random() * SAVE_DOC_CHECK_CYCLE);
            if (now() - lastSaved.time < SAVE_DOC_TIME) { return; }
            // avoid queuing up multiple merge dialogs
            if (mergeDialogCurrentlyDisplayed) { return; }

            // demoMode lets the user preview realtime behaviour
            // without actually requiring permission to save
            if (demoMode) { return; }

            saveRoutine();
        };
        check();
        socket.onClose.push(function () {
            clearTimeout(to);
        });
    };

    /* Test cases below */
    var trialMergeOverwrite = function (O, A, B, C, cb) {
        /*
            this won't be a terribly useful test until it's integrated
            into the actual rt-editor, but it demonstrates the principal
            of the merge-overwrite bug

            it should be easy to modify this to work within the actual textarea

            with the merge overwrite bug as it is, this is the problem:

            O => "this is a test"
            A => "all this is a test"
            B => "this is totally a test"
            C => "this is totally a test ... NOT!"

            where C was inserted in the interim of merge3(O, A, B)

            the result becomes: "all this is totally a test"
        */

        var simpleSave = function (body, cb) {
            if (typeof cb === 'undefined'){
                return;
            }
            var $textarea = $('<textarea>').val(body);

            saveDocument($textarea[0], mainConfig.language, function (saveErr) {
                if (saveErr) {
                    // report your error
                    warn(saveErr);
                    cb(saveErr);
                } else {
                    cb(null);
                }
            });
        };

        // the text area we'll test with
        var $testArea = $('<textarea>').val(B);

        var overwrite = function (cb) {
            ajaxMerge($testArea[0], function (e, out) {
                if (e) {
                    // ajax error
                    cb('unsuccessful ajax call');
                } else {
                    // when your ajax call returns, swap in the merged content
                    $testArea.val(out.content);
                    // pass the resulting content into the callback
                    // then test to see if the content from C was overwritten
                    cb(null, $testArea.val());
                }
            });
            // while the ajax merge is pending, swap in your new content
            $testArea.val(C);
        };

        // save 'O' so there is guaranteed to be a base version
        simpleSave(O, function (e) {
            if (e) {
                warn(e);
                cb("failed on first save");
            } else {
                // save 'A' so it's guaranteed to threeway merge
                simpleSave(A, function (e) {
                    if (e) {
                        cb("failed on second save");
                    } else {
                        overwrite(cb);
                    }
                });
            }
        });
    };

    window.trialSaveAndMerge = function (A, O, B, cb) {
        /*
            where O is the common ancestor between A and B
            and B is the text which will be preferred by the merge algorithm
        */
        
        if (typeof cb === 'undefined') {
            return;
        }
        /*  WARNING, this will not affect your textarea
            but it *will* affect your version history.
            It's recommended that you run this in unessential pages */

        // we need a textarea to pass to saveDocument
        var $textarea = $('<textarea>');

        var forceSave = function (body, cb) {
            // fill the textarea with 'body' and save its contents
            saveDocument($textarea.val(body)[0], mainConfig.language, function (saveErr) {
                if (saveErr) {
                    // report error
                    cb(saveErr,null);
                } else {
                    // get the version of that save
                    ajaxVersion(function (versionErr, out) {
                        if (versionErr) {
                            cb(versionErr,null);
                        } else {
                            cb(null,out);
                        }
                    });
                }
            });
        };

        // save 'O' and get its version
        forceSave(O, function (e, out) {
            if (e) {
                warn(e);
            } else {
                var commonAncestor = out.version;
                debug(out);
                // modify the page so that you can use the bumped version
                // otherwise you'd have to reload the page
                //$('[data-xwiki-version]').data('xwiki-version',commonAncestor);

                // do the same for 'A'
                forceSave(A, function (e, out) {
                    var forkedVersion = out.version;
                    //console.log(out);
                    debug("Performed a three way merge with version "+forkedVersion+" and " +commonAncestor);

                    // attempt to merge 'B' and 'A' with the version of 'O'
                    if (e) {
                        cb(e,null);
                    } else {
                        ajaxMerge($textarea.val(B)[0], cb);
                    }
                });
            }
        });
    };

    var isSocketDisconnected = function (socket, realtime) {
        return socket.readyState === socket.CLOSING ||
            socket.readyState === socket.CLOSED ||
            (realtime.getLag().waiting && realtime.getLag().lag > MAX_LAG_BEFORE_DISCONNECT);
    };

    var setAutosaveHiddenState = function (hidden) {
        var elem = $('#autosaveControl');
        if (hidden) {
            elem.hide();
        } else {
            elem.show();
        }
    };

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

        var toolbar = createRealtimeToolbar(toolbarContainer);

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

            var userListElement = createUserList(realtime,
                                                 userName,
                                                 toolbar.find('.rtwiki-toolbar-leftside'),
                                                 messages);

            userListElement.text(messages.initializing);

            createLagElement(socket,
                             realtime,
                             toolbar.find('.rtwiki-toolbar-rightside'),
                             messages);

            createMergeMessageElement(toolbar.find('.rtwiki-toolbar-rightside'),messages);

            setAutosaveHiddenState(true);

            createSaver(socket, channel, userName, textArea, demoMode, language, messages);

            socket.onMessage.push(function (evt) {
                verbose(evt.data);
                realtime.message(evt.data);
            });
            realtime.onMessage(function (message) { socket.send(message); });

            $(textArea).attr("disabled", "disabled");

            realtime.onUserListChange(function (userList) {
                if (initializing && userList.indexOf(userName) > -1) {
                    initializing = false;
                    var userDoc=realtime.getUserDoc();
                    var $textArea=$(textArea);

                    /* RT_event-pre_chain */
                    // addresses http://jira.xwiki.org/browse/RTWIKI-28
                    lastSaved.content = $textArea.val();

                    // TODO we occasionally get an out of date document...
                    // http://jira.xwiki.org/browse/RTWIKI-31
                    // fix by merging...
                    $textArea.val(userDoc);
                    TextArea.attach($(textArea)[0], realtime);
                    $textArea.removeAttr("disabled");
                }
                if (!initializing) {
                    updateUserList(userName, userListElement, userList, messages);
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
            setAutosaveHiddenState(false);
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

    var editor = function (websocketUrl, userName, messages, channel, demoMode, language) {
        var contentInner = $('#xwikieditcontentinner');
        var textArea = contentInner.find('#content');
        if (!textArea.length) {
            warn("WARNING: Could not find textarea to bind to");
            return;
        }

        if (createPageMode()) { return; }

        if (checkSectionEdit()) { return; }

        setStyle();

        var checked = (localStorage.getItem(LOCALSTORAGE_DISALLOW)) ? "" : 'checked="checked"';
        var allowRealtimeCbId = uid();
        $('#mainEditArea .buttons').append(
            '<div class="rtwiki-allow-outerdiv">' +
                '<label class="rtwiki-allow-label" for="' + allowRealtimeCbId + '">' +
                    '<input type="checkbox" class="rtwiki-allow" id="' + allowRealtimeCbId + '" ' +
                        checked + '" />' +
                    ' ' + messages.allowRealtime +
                '</label>' +
            '</div>'
        );

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

        seekToSection(textArea, function (err) {
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


        if (!websocketUrl) {
            throw new Error("No WebSocket URL, please ensure Realtime Backend is installed.");
        }

        // Either we are in edit mode or the document is locked.
        // There is no cross-language way that the UI tells us the document is locked
        // but we can hunt for the force button.
        var forceLink = $('a[href$="&force=1"][href*="/edit/"]');

        var hasActiveRealtimeSession = function () {
            forceLink.text(messages.joinSession);
            forceLink.attr('href', forceLink.attr('href') + '&editor=wiki');
        };

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
