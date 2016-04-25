define([
  'jquery',
  'RTWiki_WebHome_sharejs_textarea',
  'RTWiki_ErrorBox',
  'RTWiki_WebHome_interface',
  'RTWiki_WebHome_saver',
  'RTWiki_WebHome_chainpad',
], function($, TextArea, ErrorBox, Interface) {
    var ChainPad = window.ChainPad;
    var module = { exports: {} };

    /*  TODO
        move all your constants into an object that you can inspect more easily
    */
    var LOCALSTORAGE_DISALLOW = 'rtwiki-disallow';

    // Number for a message type which will not interfere with chainpad.
    var MESSAGE_TYPE_ISAVED = 5000;

    // how often to check if the document has been saved recently
    var SAVE_DOC_CHECK_CYCLE = 20000;

    var SAVE_DOC_TIME = 60000;

    // How long to wait before determining that the connection is lost.
    var MAX_LAG_BEFORE_DISCONNECT = 30000;

    // we can't avoid putting this in a very high scope, because lots of things
    // rely on it. Modify with extreme caution and avoid race conditions
    var mainConfig;

    /*  TODO
        move into realtime-frontend

        Autosaver.js
    */
    var lastSaved = {
        content: '',
        version: $('html').data('xwiki-version'),
        time: 0,
        // http://jira.xwiki.org/browse/RTWIKI-37
        hasModifications: false,
        // for future tracking of 'edited since last save'
        // only show the merge dialog to those who have edited
        wasEditedLocally: false,
        receivedISAVE: false,
        shouldRedirect: false,
        isavedSignature: ''
    };

    // TODO autosaver
    var updateLastSaved = function (content) {
        lastSaved.time = now();
        lastSaved.content = content;
        lastSaved.wasEditedLocally = false;
    };

    // TODO autosaver
    var isaveInterrupt = function () {
        if (lastSaved.receivedISAVE) {
            warn("Another client sent an ISAVED message.");
            warn("Aborting save action");
            // unset the flag, or else it will persist
            lastSaved.receivedISAVE = false;
            // return true such that calling functions know to abort
            return true;
        }
        return false;
    };

    var warn = function (x) {};
    var debug = function (x) {};
    // there was way too much noise, if you want to know everything use verbose
    var verbose = function (x) {};
    //verbose = function (x) { console.log(x); };
    debug = function (x) { console.log(x) };
    warn = function (x) { console.log(x) };

    var uid = Interface.uid;

    /*  TODO move into Interface?
    */
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
            if (userList[i] === myUserName) {
                continue;
            }
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

    /*  TODO
        move into Interface (after factoring out more arguments)

        // maybe this should go in autosaver instead?
    */
    var createMergeMessageElement = function (container, messages) {
        var id = uid();
        $(container).prepend( '<div class="rtwiki-merge" id="'+id+'"></div>');
        var $merges = lastSaved.messageElement = $('#'+id);

        var timeout;

        // drop a method into the lastSaved object which handles messages
        lastSaved.mergeMessage = function (msg_type, args) {
            // keep multiple message sequences from fighting over resources
            timeout && clearTimeout(timeout);

            var formattedMessage = messages[msg_type].replace(/\{\d+\}/g, function (token) {
                // if you pass an insufficient number of arguments
                // it will return 'undefined'
                return args[token.slice(1,-1)];
            });

            debug(formattedMessage);

            // set the message, handle all types
            $merges.text(formattedMessage);

            // clear the message box in five seconds
            // 1.5s message fadeout time
            timeout = setTimeout(function () {
                $merges.fadeOut(1500, function () {
                    $merges.text('');
                    $merges.show();
                });
            },10000);
        };
        return $merges;
    };

    var now = function () { return (new Date()).getTime(); };

    var getFormToken = Interface.getFormToken;

    /*  TODO
        move into Interface

        watch out for 'debug'
    */
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

    /*  TODO
        move into interface
    */
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

    /*  TODO
        move into Interface
    */
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

    /* TODO
        move into realtime-frontend?
    */
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

    /*  TODO
        Currently this takes a textarea and a callback.
        but we want to move it out into realtime-frontend.
        To generalize it, we should get the value of the textarea instead,
        and just expect a string (the content of the document to be saved)
    */
    var ajaxMerge = function (textArea, cb) {
        // outputSyntax=plain is no longer necessary
        var url = mainConfig.ajaxMergeUrl + '?xpage=plain&outputSyntax=plain';

        /* version, document */
        var stats=getDocumentStatistics();

        stats.content = $(textArea).val();

        console.log("Posting with the following stats");
        console.log(stats);

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

    /*  TODO
        move into realtime-frontend
    */
    // check a serverside api for the version string of the document
    var ajaxVersion = function (cb) {
        var url = mainConfig.ajaxVersionUrl + '?xpage=plain';
        var stats = getDocumentStatistics();
        $.ajax({
            url: url,
            method: 'POST',
            dataType: 'json',
            success: function (data) {
                cb(null, data);
            },
            data: stats,
            error: function (err) {
                cb(err, null);
            }
        });
    };

    /*  TODO
        move into realtime-frontend

        //
    */
    var bumpVersion = function (socket, channel, myUserName, cb) {
        ajaxVersion(function (e, out) {
            if (e) {
                warn(e);
            } else if (out) {
                debug("Triggering lastSaved refresh on remote clients");
                lastSaved.version = out.version;
                saveMessage(socket, channel, myUserName, lastSaved.version);
                cb && cb(out);
            } else {
                throw new Error();
            }
        });
    };

    /*  TODO
        pass in value instead of textarea
        move into realtime-frontend

        // FIXME
        // depends on getFormToken which is in interface.js
    */
    // http://jira.xwiki.org/browse/RTWIKI-29
    var saveDocument = function (textArea, config, andThen) {
        /* RT_event-on_save */
        debug("saving document...");

        var data = {
            // title if can be done realtime
            xredirect: '',
            content: $(textArea).val(),
            xeditaction: 'edit',
            // TODO make this translatable
            comment: 'Auto-Saved by Realtime Session',
            action_saveandcontinue: 'Save & Continue',
            minorEdit: 1,
            ajax: true,
            form_token: getFormToken(),
            language: mainConfig.language
        };

        // override default data with configuration
        Object.keys(config).forEach(function (key) {
            data[key] = config[key];
        });

        $.ajax({
            url: window.docsaveurl,
            type: "POST",
            async: true,
            dataType: 'text',

            // http://jira.xwiki.org/browse/RTWIKI-36
            // don't worry about hijacking and resuming
            // if you can just add the usual fields to this, simply steal the event
            data: data,
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

    /*  TODO
        move into realtime-frontend
    */
    // sends an ISAVED message
    var saveMessage=function (socket, channel, myUserName, version) {
        debug("saved document"); // RT_event-on_save
        var saved = JSON.stringify([MESSAGE_TYPE_ISAVED, version]);
        // show(saved(version))
        lastSaved.mergeMessage('saved', [version]);
        socket.send('1:x' +
            myUserName.length + ':' + myUserName +
            channel.length + ':' + channel +
            saved.length + ':' + saved
        );
    };

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
        move into realtime-frontend
    */
    var presentMergeDialog = function(question, labelDefault, choiceDefault, labelAlternative, choiceAlternative){
        var behave = {
           onYes: choiceDefault,
           onNo: choiceAlternative
        };

        var param = {
            confirmationText: question,
            yesButtonText: labelDefault,
            noButtonText: labelAlternative,
            showCancelButton: true
        };

        new XWiki.widgets.ConfirmationBox(behave, param);
    };

    /*  TODO
        move this into realtime-frontend
    */
    var destroyDialog = function (cb) {
        var $box = $('.xdialog-box.xdialog-box-confirmation'),
            $question = $box.find('.question'),
            $content = $box.find('.xdialog-content');
        if ($box.length) {
            $content.find('.button.cancel').click();
            cb && cb(true);
        } else {
            cb && cb(false);
        }
    };

    /*  TODO
        move into realtime-frontend
        autosaver

        // only used within 'createSaver'
    */
    var redirectToView = function () {
        window.location.href = window.XWiki.currentDocument.getURL('view');
    };

    /*  TODO
        move into realtime-frontend
        autosaver
    */
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
        iesulting new version. They then update their local state to match.

        During this process, a series of checks are made to reduce the number
        of unnecessary saves, as well as the number of unnecessary merges.
    */
    var createSaver = function (socket, channel, myUserName, textArea, demoMode, language, messages) {
        socket.realtime.localChange = function (condition) {
            lastSaved.wasEditedLocally = condition;
        };

        lastSaved.time = now();
        var mergeDialogCurrentlyDisplayed = false;

        /* ISAVED listener */
        socket.onMessage.unshift(function (evt) {
            // set a flag so any concurrent processes know to abort
            lastSaved.receivedISAVE = true;

            // get the content...
            var chanIdx = evt.data.indexOf(channel);
            var content = evt.data.substring(evt.data.indexOf(':[', chanIdx + channel.length)+1);

            // parse
            var json = JSON.parse(content);

            // not an isaved message
            if (json[0] !== MESSAGE_TYPE_ISAVED) { return; }

            /*  RT_event-on_isave_receive

                clients update lastSaved.version when they perform a save,
                then they send an ISAVED with the version
                a single user might have multiple windows open, for some reason
                but might still have different save cycles
                checking whether the received version matches the local version
                tells us whether the ISAVED was set by our *browser*
                if not, we should treat it as foreign.
            */
            if (lastSaved.version !== json[1]) {
                // a merge dialog might be open, if so, remove it and say as much
                destroyDialog(function (dialogDestroyed) {
                    if (dialogDestroyed) {
                        // tell the user about the merge resolution
                        lastSaved.mergeMessage('conflictResolved', [json[1]]);
                    } else {
                        // otherwise say there was a remote save
                        // http://jira.xwiki.org/browse/RTWIKI-34
                        var remoteUser = decodeURIComponent(
                            evt.data.replace(/^[^\-]*-|%2d[^%]*$/g, ''));
                        lastSaved.mergeMessage(
                            'savedRemote',
                            [json[1], remoteUser]);
                    }
                });

                debug("A remote client saved and "+
                    "incremented the latest common ancestor");

                // update lastSaved attributes
                lastSaved.wasEditedLocally = false;

                // update the local latest Common Ancestor version string
                lastSaved.version = json[1];

                // remember the state of the textArea when last saved
                // so that we can avoid additional minor versions
                // there's a *tiny* race condition here
                // but it's probably not an issue
                lastSaved.content = $(textArea).val();
            } else {
                lastSaved.onReceiveOwnIsave && lastSaved.onReceiveOwnIsave();
            }
            lastSaved.time = now();
            return false;
        }); // end onMessage

        // originally implemented as part of 'saveRoutine', abstracted logic
        // such that the merge/save algorithm can terminate with different
        // callbacks for different use cases
        var saveFinalizer = function (e, shouldSave) {
            var toSave = $(textArea).val();
            if (e) {
                warn(e);
                return;
            } else if (shouldSave) {

                var options = {
                    language:language
                };

                saveDocument(textArea, options, function () {
                    // cache this because bumpVersion will increment it
                    var lastVersion = lastSaved.version;

                    // update values in lastSaved
                    updateLastSaved(toSave);

                    // get document version
                    bumpVersion(socket, channel, myUserName, function (out){
                        if (out.version === "1.1") {
                            debug("Created document version 1.1");
                        } else {
                            debug("Version bumped from " + lastVersion +
                                " to " + out.version + ".");
                        }
                        lastSaved.mergeMessage('saved',[out.version]);
                    });
                });
                return;
            } else {
                // local content matches that of the latest version
                verbose("No save was necessary");
                lastSaved.content = toSave;
                // didn't save, don't need a callback
                bumpVersion(socket, channel, myUserName);
                return;
            }
        };

        var saveRoutine = function (andThen, force) {
            // if this is ever true in your save routine, complain and abort
            lastSaved.receivedISAVE = false;

            var toSave = $(textArea).val();
            if (lastSaved.content === toSave && !force ) {
                verbose("No changes made since last save. "+
                    "Avoiding unnecessary commits");
                return;
            }

            // post your current version to the server to see if it must merge
            // remember the current state so you can check if it has changed.
            var preMergeContent = $(textArea).val();
            ajaxMerge(textArea, function (err, merge) {
                if (err) {
                    if (typeof merge === 'undefined') {
                        warn("The ajax merge API did not return an object. "+
                            "Something went wrong");
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

                if (isaveInterrupt()) {
                    andThen("ISAVED interrupt", null);
                    return;
                }

                toSave = merge.content;
                if (toSave === lastSaved.content) {
                    debug("Merging didn't result in a change.");
/* FIXME merge on load isn't working
                    if (force) {
                        debug("Force option was passed, merging anyway.");
                    } else { */
                        // don't dead end, but indicate that you shouldn't save.
                        andThen("Merging didn't result in a change.", false);
                        return;
//                    }
                }

                var $textArea = $(textArea);

                var continuation = function (callback) {
                    // callback takes signature (err, shouldSave)

                    // our continuation has three cases:
                    if (isaveInterrupt()) {
                    // 1. ISAVE interrupt error
                        callback("ISAVED interrupt", null);
                    } else if (merge.saveRequired) {
                    // 2. saveRequired
                        callback(null, true);
                    } else {
                    // 3. saveNotRequired
                        callback(null, false);
                    }
                }; // end continuation

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
                        presentMergeDialog(
                            messages.mergeDialog_prompt,

                            messages.mergeDialog_keepRealtime,
                            function () {
                                debug("User chose to use the realtime version!");
                                // unset the merge dialog flag
                                mergeDialogCurrentlyDisplayed = false;
                                continuation(andThen);
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
                                        socket.realtime.bumpSharejs();

                                        debug("Overwrote the realtime session's content with the latest saved state");
                                        bumpVersion(socket, channel, myUserName, function () {
                                            lastSaved.mergeMessage('merge overwrite',[]);
                                        });
                                        continuation(andThen);
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
                        // it merged and there were no errors
                        if (preMergeContent !== $textArea.val()) {
                            /* but there have been changes since merging
                                don't overwrite if there have been changes while merging
                                http://jira.xwiki.org/browse/RTWIKI-37 */

                            andThen("The realtime content changed while we "+
                                "were performing our asynchronous merge.",
                                false);
                            return; // try again in one cycle
                        } else {
                            // walk the tree of hashes and if merge.previousVersionContent
                            // exists, then this merge is quite possibly faulty

                            if (socket.realtime.wasEverState(merge.previousVersionContent)) {
                                debug("The server merged a version which already existed in the history. " +
                                    "Reversions shouldn't merge. Ignoring merge");

                                debug("waseverstate=true");
                                continuation(andThen);
                                return;
                            } else {
                                debug("The latest version content does not exist anywhere in our history");
                                debug("Continuing...");
                            }

                            // there were no errors or local changes push to the textarea
                            $textArea.val(toSave);
                            // bump sharejs to force propogation. only if changed
                            socket.realtime.bumpSharejs();
                            // TODO show message informing the user
                            // which versions were merged...
                            continuation(andThen);
                        }
                    }
                } else {
                    // no merge was necessary, but you might still have to save
                    // pass in a callback...
                    continuation(andThen);
                }
            });
        }; // end saveRoutine

        var saveButtonAction = function (cont) {
            debug("createSaver.saveand"+(cont?"view":"continue"));

            // name this flag for readability
            var force = true;
            saveRoutine(function (e, shouldSave) {
                var toSave = $(textArea).val();
                if (e) {
                    warn(e);
                    //return;
                }

                lastSaved.shouldRedirect = cont;
                // fire save event
                document.fire('xwiki:actions:save', {
                    form: $('#edit')[0],
                    continue: 1
                });
            }, force);
        };

        // replace callbacks for the save and view button
        $('[name="action_save"]')
            .off('click')
            .click(function (e) {
                e.preventDefault();
                // arg is 'shouldRedirect'
                saveButtonAction (true);
            });

        // replace callbacks for the save and continue button
        var $sac = $('[name="action_saveandcontinue"]');
        $sac[0].stopObserving();
        $sac.click(function (e) {
            e.preventDefault();
            // should redirect?
            saveButtonAction(false);
        });

        // there's a very small chance that the preview button might cause
        // problems, so let's just get rid of it
        $('[name="action_preview"]').remove();

        // wait to get saved event
        document.observe('xwiki:document:saved', function (ev) {
            // this means your save has worked

            // cache the last version
            var lastVersion = lastSaved.version;
            var toSave = $(textArea).val();

            // update your content
            updateLastSaved(toSave);

            ajaxVersion(function (e, out) {
                if (e) {
                    // there was an error (probably ajax)
                    warn(e);
                    ErrorBox.show('save');
                } else if (out.isNew) {
                    // it didn't actually save?
                    ErrorBox.show('save');
                } else {
                    lastSaved.onReceiveOwnIsave = function () {
                        // once you get your isaved back, redirect
                        debug("lastSaved.shouldRedirect " +
                            lastSaved.shouldRedirect);
                        if (lastSaved.shouldRedirect) {
                            debug('createSaver.saveandview.receivedOwnIsaved');
                            debug("redirecting!");
                            redirectToView();
                        } else {
                            debug('createSaver.saveandcontinue.receivedOwnIsaved');
                        }
                        // clean up after yourself..
                        lastSaved.onReceiveOwnIsave = null;
                    };
                    // bump the version, fire your isaved
                    bumpVersion(socket, channel, myUserName, function (out) {
                        if (out.version === "1.1") {
                            debug("Created document version 1.1");
                        } else {
                            debug("Version bumped from " + lastVersion +
                                " to " + out.version + ".");
                        }
                        lastSaved.mergeMessage("saved", [out.version]);
                    });
                }
            });
            return true;
        });

        document.observe("xwiki:document:saveFailed", function (ev) {
            ErrorBox.show('save');
            warn("save failed!!!");
        });

        // TimeOut
        var to;

        var check = function () {
            if (to) { clearTimeout(to); }
            verbose("createSaver.check");
            var periodDuration = Math.random() * SAVE_DOC_CHECK_CYCLE;
            to = setTimeout(check, periodDuration);

            verbose("Will attempt to save again in " + periodDuration +"ms.");

            if (!lastSaved.wasEditedLocally) {
                verbose("Skipping save routine because no changes have been made locally");
                return;
            } else {
                verbose("There have been local changes!");
            }
            if (now() - lastSaved.time < SAVE_DOC_TIME) {
                verbose("(Now - lastSaved.time) < SAVE_DOC_TIME");
                return;
            }
            // avoid queuing up multiple merge dialogs
            if (mergeDialogCurrentlyDisplayed) { return; }

            // demoMode lets the user preview realtime behaviour
            // without actually requiring permission to save
            if (demoMode) { return; }

            saveRoutine(saveFinalizer);
        }; // end check

/*
        (function(){
            var force = true;
            var id="secret-merge";
            $('.rtwiki-toolbar').prepend('<a href="#" id="'+id+'">force merge</a>');
            $('#'+id).click(function (e) {
                e.preventDefault();
                saveRoutine(saveFinalizer, force);
            })
            .click(); // this should merge your page on load
            // ensuring that all clients are up to date.
        }());   */

        check();
        socket.onClose.push(function () {
            clearTimeout(to);
        });
    }; // END createSaver

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

            createMergeMessageElement(toolbar
                .find('.rtwiki-toolbar-rightside'),
                messages);

            Interface.setAutosaveHiddenState(true);

            socket.onMessage.push(function (evt) {
                verbose(evt.data);
                // shortcircuit so chainpad doesn't complain about bad messages
                if (/:\[5000,/.test(evt.data)) { return; }
                realtime.message(evt.data);
            });
            realtime.onMessage(function (message) {
                socket.send(message);
            });

            $(textArea).attr("disabled", "disabled");

            realtime.onUserListChange(function (userList) {
                if (initializing && userList.indexOf(userName) > -1) {
                    initializing = false;
                    var userDoc=realtime.getUserDoc();
                    var $textArea=$(textArea);

                    /* RT_event-pre_chain */
                    // addresses http://jira.xwiki.org/browse/RTWIKI-28
                    lastSaved.content = $textArea.val();

                    $textArea.val(userDoc);
                    TextArea.attach($(textArea)[0], realtime);
                    $textArea.removeAttr("disabled");

                    // we occasionally get an out of date document...
                    // http://jira.xwiki.org/browse/RTWIKI-31
                    // createSaver performs a merge on its tail
                    createSaver(socket, channel, userName, textArea, demoMode, language, messages);
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
        $('#mainEditArea .buttons').append(
            '<div class="rtwiki-allow-outerdiv">' +
                '<label class="rtwiki-allow-label" for="' + allowRealtimeCbId + '">' +
                    '<input type="checkbox" class="rtwiki-allow" id="' + allowRealtimeCbId + '" ' +
                        checked + '" />' +
                    ' ' + messages.allowRealtime +
                '</label>' +
            '</div>'
        );

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

        /*  TODO
            group with lock screen code

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
            factor into realtime-frontendd
        */
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
