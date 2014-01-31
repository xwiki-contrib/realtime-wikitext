var XWiki = require('xwiki-tools');
var Fs = require('fs');

//---------------------- Create XWiki Package ----------------------//

var pack = XWiki.Package.create();
pack.setName("Realtime Wiki Editor");
pack.setDescription("Collaboratively edit your XWiki Documents with others");

// This is needed to register with the extension manager repository
pack.setExtensionId("org.xwiki.contrib:xwiki-contrib-rtwiki");


//---------------------- Add a Document ----------------------//

var doc = XWiki.model.XWikiDoc.create(["RTWiki","WebHome"]);

doc.setContent(XWiki.Tools.contentFromFile('src/XWikiToolsExample.WebHome.xwiki2'));


Fs.readdirSync('src/attachments').forEach(function(name) {
    doc.addAttachment('src/attachments/' + name);
});

// Lets give our document an object!
var obj = XWiki.model.classes.JavaScriptExtension.create();

// The object class is described here:
// https://github.com/cjdelisle/xwiki-tools/blob/master/lib/model/classes/JavaScriptExtension.js
// As with the document, fir each field there are corrisponding setters and getters.
// The setters and getters can be chained so obj.setParse(true).setUse('always').setCache('long')
// is ok.
obj.setCode(XWiki.Tools.contentFromFile("src/objects/XWiki.JavaScriptExtension/code.js"));
obj.setParse(true);
obj.setUse('always');
obj.setCache('long');
doc.addXObject(obj);

// Add the document into the package.
pack.addDocument(doc);


//---------------------- Build the package ----------------------//

// Post to a wiki?
// must post to a /preview/ page, for example:
// syntax  ./do --post Admin:admin@192.168.1.1:8080/xwiki/bin/preview//
var i;
if ((i = process.argv.indexOf('--post')) > -1) {
    pack.postToWiki(process.argv[i+1]);

} else if ((i = process.argv.indexOf('--mvn')) > -1) {
    // ./do --mvn
    // Generate output which can be consumed by Maven to build a .xar
    pack.genMvn('mvnout');

} else {
    // default:
    // Generate an xar file.
    pack.genXar('xwiki-contrib-rtwiki.xar');
}
