;(function() {
  if (XWiki.contextaction != 'edit') { return; }

  // VELOCITY
  var WEBSOCKET_URL = "$services.websocket.getURL('realtime')";
  var USER = "$services.model.resolveDocument($xcontext.getUser())";
  var ALLOW_REALTIME = "Allow Realtime Collaboration"; // TODO: translate
  var JOIN_REALTIME = "Join Realtime Collaborative Session";
  var PATHS = {
    RTWiki_WebHome_chainpad: "$doc.getAttachmentURL('chainpad.js')",
    RTWiki_WebHome_sharejs_textarea: "$doc.getAttachmentURL('sharejs_textarea.js')"
  };
  // END_VELOCITY

  for (var path in PATHS) { PATHS[path] = PATHS[path].replace(/\.js$/, ''); }
  require.config({paths:PATHS});

  // remove to debug
  var console = { log:function() {} };

  require(['jquery', 'RTWiki_WebHome_sharejs_textarea', 'RTWiki_WebHome_chainpad'],
          function($, TextArea)
  {
    var ChainPad = window.ChainPad;
    var startWebSocket = function (elem) {
      console.log("Opening websocket");
      localStorage.removeItem('realtimeDisallow');

      var socket = new WebSocket(WEBSOCKET_URL);
      socket.onopen = function(evt) {
        var initState = $(elem).val();
        var realtime = ChainPad.create(USER + '-' + String(Math.random()).substring(2),
                                       'x',
                                       JSON.stringify(XWiki.currentDocument),
                                       initState);
        socket.onmessage = function (evt) {
          console.log(evt.data);
          realtime.message(evt.data);
        };
        realtime.onMessage(function (message) { socket.send(message); });

        TextArea.attach($(elem)[0], realtime, initState);
        console.log("Bound websocket");
        realtime.start();
        socket.realtime = realtime;
      };
      socket.onclose = function(evt) { console.log("socket closed"); console.log(evt); };
      socket.onerror = function(evt) { console.log("socket error "); console.log(evt); };
      return socket;
    };

    var stopWebSocket = function (socket) {
      console.log("Stopping websocket");
      localStorage.setItem('realtimeDisallow', true);
      if (!socket) { return; }
      socket.realtime.abort();
      socket.close();
      socket = undefined;
    };

    var editor = function () {
      var element = $('#xwikitext #content');

      if (!element.length) { return; }

      // WYSIWYG mode
      if (typeof(Wysiwyg) === 'object' && Wysiwyg) { return; }

      var checked = (localStorage.getItem('realtimeDisallow') === true) ? "" : "checked";

      $('#mainEditArea .buttons').append(
      '<div id="allowRealtimeDiv">' +
        '<label class="allowRealtime" for="allowRealtimeCb">' +
          '<input type="checkbox" id="allowRealtimeCb" checked="'+checked+'"></input>' +
          ' ' + ALLOW_REALTIME +
        '</label>' +
      '</div>');

      var socket;
      $('#allowRealtimeCb').click(function (evt) {
        if (this.checked) {
          socket = startWebSocket(element);
        } else {
          stopWebSocket(socket);
        }
      });

      if (checked === "checked") {
        socket = startWebSocket(element);
      }
    };

    var main = function () {
        // Either we are in edit mode or the document is locked.
        // There is no cross-language way that the UI tells us the document is locked
        // but we can hunt for the force button.
        var forceLink = $('a[href$="&force=1"][href*="/edit/"]');

        var hasActiveRealtimeSession = function () {
            forceLink.text(JOIN_REALTIME);
            forceLink.attr('href', forceLink.attr('href') + '&editor=wiki');
        }

        if (forceLink.length && !localStorage.getItem('realtimeDisallow')) {
            // ok it's locked.
            var socket = new WebSocket(WEBSOCKET_URL);
            socket.onopen = function(evt) {
                var user = USER + '-' + String(Math.random()).substring(2);
                var chan = JSON.stringify(XWiki.currentDocument);
                socket.onmessage = function (evt) {
                    console.log("Message! " + evt.data);
                    if (evt.data !== ('0:' + chan.length + ':' + chan + '5:[1,0]')) {
                        console.log("hasActiveRealtimeSession");
                        socket.close();
                        hasActiveRealtimeSession();
                    }
                };
                socket.send('1:x' + user.length + ':' + user + chan.length + ':' + chan + '3:[0]');
                console.log("Bound websocket");
            };
        } else {
            editor();
        }
    };
    main();

  });
})();
