# Realtime Collaborative Plain WikiText Editor

[![XWiki labs logo](https://raw.githubusercontent.com/xwiki-labs/xwiki-labs-logo/master/projects/xwikilabs/xwikilabsproject.png "XWiki labs")](https://labs.xwiki.com/xwiki/bin/view/Projects/XWikiLabsProject)

This editor makes use of the [ChainPad][chainpad] realtime editor engine and binds
to a the XWiki plain WikiText editor. You can install it from the XWiki Extension Manager
or build it manually using [node-xwikimodel][] to construct the .xar file.
install the [XWiki Realtime Backend][rtbackend] from the Extension Manager and build
the .xar file as follows:

    # first make sure you have an up-to-date version of node-xwikimodel
    git clone git://github.com/xwiki-contrib/node-xwikimodel.git
    cd node-xwikimodel
    npm install -g


    # then run the builder
    ./do

    # and import the resulting XAR file.

Alternatively you can build and import in one operation using:

    ./do --post Admin:admin@mywikidomain.name:8080/xwiki

Or generate a Maven compatible build using:

    ./do --mvn


[chainpad]: https://github.com/xwiki-contrib/chainpad
[rtbackend]: http://extensions.xwiki.org/xwiki/bin/view/Extension/RtBackend
[node-xwikimodel]: https://github.com/xwiki-contrib/node-xwikimodel
