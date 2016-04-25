define([
    'jquery',
], function ($) {

    var warn = function (x) {};
    var debug = function (x) {};
    // there was way too much noise, if you want to know everything use verbose
    var verbose = function (x) {};
    //verbose = function (x) { console.log(x); };
    debug = function (x) { console.log(x) };
    warn = function (x) { console.log(x) };


    var now = function () { return (new Date()).getTime(); };


    var module = {};



    


    return module;
});
