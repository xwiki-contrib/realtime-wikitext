define([
    'RTWysiwyg_WebHome_messages'
], function (Messages) {

    /** Tyoe/name of the editor */
    var EDITOR = 'rtwiki'; //TODO

    /** Id of the element for getting debug info. */
    var DEBUG_LINK_CLS = 'rtwiki-debug-link';

    /** Id of the div containing the user list. */
    var USER_LIST_CLS = 'rtwiki-user-list';

    /** Id of the div containing the lag info. */
    var LAG_ELEM_CLS = 'rtwiki-lag';

    /** The toolbar class which contains the user list, debug link and lag. */
    var TOOLBAR_CLS = 'rtwiki-toolbar';

    /** Key in the localStore which indicates realtime activity should be disallowed. */
    var LOCALSTORAGE_DISALLOW = 'rtwiki-disallow';

    var SPINNER_DISAPPEAR_TIME = 3000;
    var SPINNER = [ '-', '\\', '|', '/' ];

    var uid = function () {
        return 'rtwiki-uid-' + String(Math.random()).substring(2);
    };

    var createRealtimeToolbar = function ($container) {
        var id = uid();
        $container.prepend(
            '<div class="' + TOOLBAR_CLS + '" id="' + id + '">' +
                '<div class="rtwiki-toolbar-leftside"></div>' +
                '<div class="rtwiki-toolbar-rightside"></div>' +
            '</div>'
        );
        var toolbar = $container.find('#'+id);
        toolbar.append([
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
            '.rtwiki-toolbar-leftside {',
            '    float: left;',
            '}',
            '.rtwiki-toolbar-rightside {',
            '    float: right;',
            '}',
            '.rtwiki-lag {',
            '    float: right;',
            '}',
            '.rtwiki-spinner {',
            '    float: left;',
            '}',
            '.rtwiki-merge {',
            '    float: left',
            '}',
            '#secret-merge {',
            '   opacity: 0;',
            '}',
            '#secret-merge:hover {',
            '   opacity: 1;',
            '}',
            '</style>'
         ].join('\n'));
        return toolbar;
    };

    var createSpinner = function ($container) {
        var id = uid();
        $container.append('<div class="rtwiki-spinner" id="'+id+'"></div>');
        return $container.find('#'+id)[0];
    };

    var kickSpinner = function (spinnerElement, reversed) {
        var txt = spinnerElement.textContent || '-';
        var inc = (reversed) ? -1 : 1;
        spinnerElement.textContent = SPINNER[(SPINNER.indexOf(txt) + inc) % SPINNER.length];
        if (spinnerElement.timeout) { clearTimeout(spinnerElement.timeout); }
        spinnerElement.timeout = setTimeout(function () {
            spinnerElement.textContent = '';
        }, SPINNER_DISAPPEAR_TIME);
    };

    var createUserList = function ($container) {
        var id = uid();
        $container.append('<div class="' + USER_LIST_CLS + '" id="'+id+'"></div>');
        return $container.find('#'+id)[0];
    };

    var getOtherUsers = function(myUserName, userList, userData) {
      var i = 0;
      var list = '';
      userList.forEach(function(user) {
        if(user !== myUserName) {
          var data = (userData) ? (userData[user] || null) : null;
          var userName = (data) ? data.name : null;
          userName = (userName) ? userName.replace(/^.*-([^-]*)%2d[0-9]*$/, function(all, one) {
              return decodeURIComponent(one);
            }) : null;
          if(userName) {
            if(i === 0) { list = ' : '; }
            list += userName + ', ';
            i++;
          }
        }
      });
      return (i > 0) ? list.slice(0, -2) : list;
    };

    var updateUserList = function (myUserName, listElement, userList, userData) {
        var meIdx = userList.indexOf(myUserName);
        if (meIdx === -1) {
            listElement.textContent = Messages.synchronizing;
            return;
        }
        if (userList.length === 1) {
            listElement.innerHTML = Messages.editingAlone;
        } else if (userList.length === 2) {
            listElement.innerHTML = Messages.editingWithOneOtherPerson + getOtherUsers(myUserName, userList, userData);
        } else {
            listElement.innerHTML = Messages.editingWith + ' ' + (userList.length - 1) + ' ' + Messages.otherPeople + getOtherUsers(myUserName, userList, userData);
        }
    };

    var createLagElement = function ($container) {
        var id = uid();
        $container.append('<div class="' + LAG_ELEM_CLS + '" id="'+id+'"></div>');
        return $container.find('#'+id)[0];
    };

    var checkLag = function (getLag, lagElement) {
        if(typeof getLag !== "function") { return; }
        var lag = getLag();
        var lagMsg = Messages.lag + ' ';
        if(lag) {
          var lagSec = lag/1000;
          if (lag.waiting && lagSec > 1) {
              lagMsg += "?? " + Math.floor(lagSec);
          } else {
              lagMsg += lagSec;
          }
        }
        else {
          lagMsg += "??";
        }
        lagElement.textContent = lagMsg;
    };

    var create = function ($container, myUserName, realtime, getLag, userList, config) {
        var toolbar = createRealtimeToolbar($container);
        // createEscape(toolbar.find('.rtwysiwyg-toolbar-leftside'));
        var userListElement = createUserList(toolbar.find('.rtwiki-toolbar-leftside'));
        var spinner = createSpinner(toolbar.find('.rtwiki-toolbar-rightside'));
        var lagElement = createLagElement(toolbar.find('.rtwiki-toolbar-rightside'));
        var userData = config.userData;
        var changeNameID = config.changeNameID;

        // Check if the user is allowed to change his name
        if(changeNameID) {
            // Create the button and update the element containing the user list
            userListElement = createChangeName($container, userListElement, changeNameID);
        }

        var connected = false;

        userList.onChange = function(newUserData) {
          var users = userList.users;
          if (users.indexOf(myUserName) !== -1) { connected = true; }
          if (!connected) { return; }
          if(newUserData) { // Someone has changed his name/color
            userData = newUserData;
          }
          updateUserList(myUserName, userListElement, users, userData);
        };

        var ks = function () {
            if (connected) { kickSpinner(spinner, false); }
        };

        realtime.onPatch(ks);
        // Try to filter out non-patch messages, doesn't have to be perfect this is just the spinner
        realtime.onMessage(function (msg) { if (msg.indexOf(':[2,') > -1) { ks(); } });

        setInterval(function () {
            if (!connected) { return; }
            checkLag(getLag, lagElement);
        }, 3000);

        return {
            toolbar: toolbar,
            failed: function () {
                connected = false;
                userListElement.textContent = '';
                lagElement.textContent = '';
            },
            reconnecting: function () {
                connected = false;
                userListElement.textContent = Messages.reconnecting;
                lagElement.textContent = '';
            },
            connected: function () {
                connected = true;
            }
        };
    };

    return { create: create };
});
