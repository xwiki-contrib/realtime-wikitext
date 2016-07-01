# Realtime Collaborative Plain WikiText Editor

[![XWiki labs logo](https://raw.githubusercontent.com/xwiki-labs/xwiki-labs-logo/master/projects/xwikilabs/xwikilabsproject.png "XWiki labs")](https://labs.xwiki.com/xwiki/bin/view/Projects/XWikiLabsProject)

This editor makes use of the [ChainPad][chainpad] realtime editor engine and binds
to a the XWiki plain WikiText editor. You can install it from the XWiki Extension Manager
(**recommended**) or build it manually using [XWiki Tools][xwiki-tools] to construct the .xar file.

If you want to install it manually, you have to install the [XWiki Realtime Frontend][rtfrontend]
from the Extension Manager or [manually][rtfrontend-github] and build the .xar file as follows:

    # First make sure you have an up-to-date version of xwiki-tools
    npm install -g xwiki-tools

    # then build the xar with xargen
    xargen

    # and import the resulting XAR file.

Alternatively you can build and import in one operation using:

    xargen --post Admin:admin@mywikidomain.name:8080/xwiki

Or generate a Maven compatible build using:

    xargen --mvn

[chainpad]: https://github.com/xwiki-contrib/chainpad
[rtfrontend]: http://extensions.xwiki.org/xwiki/bin/view/Extension/Realtime+Netflux+Frontend/
[rtfrontend-github]: https://github.com/xwiki-labs/realtime-frontend
[xwiki-tools]: https://github.com/xwiki-contrib/xwiki-tools-node
