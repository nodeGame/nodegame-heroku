/**
 * # Launcher file for nodeGame Server
 * Copyright(c) 2011-2020 Stefano Balietti
 * MIT Licensed
 *
 * Load configuration options and start the server
 *
 * http://www.nodegame.org
 */

"use strict";

// Modules.
const fs = require('fs');
const path = require('path');
const exec = require('child_process').exec;
const J = require('JSUS').JSUS;

var NDDB;

// Load commander.
var program = require('commander');

// Load the ServerNode class.
var ServerNode = require('nodegame-server').ServerNode;

// nodeGame version.
var version = require('./package.json').version;

// ServerNode object.
var sn;

// ServerNode options.
var options;

// Conf file for all variables.
var confFile;

// Other local options.
var confDir, logDir, gamesDir, debug, infoQuery, runTests;
var nClients, clientType, killServer, auth, wait, port;
var codesDb;

var cert, key;

// Warn message.
var ignoredOptions;

// Helper variables.

// Split input parameters.
function list(val) {
    return val.split(',');
}

// Go!

ignoredOptions = [];

// Defaults.

confFile = null;

confDir = './conf';
logDir = './log';
gamesDir = './games';
debug = undefined;
infoQuery = undefined;

nClients =  4;
clientType = 'autoplay';
runTests = false;
killServer = false;

// Commander.

program
    .version(version)

// Specify a configuration file (other inline-options will be ignored).

    .option('-C, --config [confFile]',
            'Specifies a configuration file to load')

// Specify inline options (more limited than a conf file, but practical).

    .option('-c, --confDir <confDir>',
            'Sets the configuration directory')
    .option('-l, --logDir <logDir>',
            'Sets the log directory')
    .option('-L, --logLevel <logDir>',
            'Sets the log level. Values: error(default)|warn|info|silly')
    .option('-g, --gamesDir <gamesDir>',
            'Sets the games directory')
    .option('-d, --debug',
            'Enables the debug mode')
    .option('-i, --infoQuery [false]',
            'Enables getting information via query-string ?q=')
    .option('-b, --build [components]',
            'Rebuilds the specified components', list)
    .option('-s, --ssl [path-to-ssl-dir]',
            'Starts the server with SSL encryption')
    .option('-f, --default [channel]',
            'Sets the default channel')
    .option('-P, --port [port]',
            'Sets the port of the server')



// Connect phantoms.

    .option('-p, --phantoms <channel>',
            'Connect phantoms to the specified channel')
    .option('-n, --nClients <n>',
            'Sets the number of clients phantoms to connect (default: 4)')
    .option('-t, --clientType <t>',
            'Sets the client type of connecting phantoms (default: autoplay)')
    .option('-T, --runTests',
            'Run tests after all phantoms are game-over ' +
            '(overwrites settings.js in test/)')
    .option('-k, --killServer',
            'Kill server after all phantoms are game-over')
    .option('-a --auth [option]',
            'Phantoms auth options. Values: new(default)|createNew|' +
            'nextAvailable|next|code|id:code&pwd:password|file:path/to/file.')
    .option('-w --wait [milliseconds]',
            'Waits before connecting the next phantom. Default: 1000')


    .parse(process.argv);


if (program.confFile) {
    if (!fs.existsSync(program.ConfFile)) {
        return printErr('--confFile ' + program.confFile + ' not found.');
    }
    options = require(program.confFile);
    if ('object' !== typeof options) {
        return printErr('--confFile ' + program.confFile + ' did not return ' +
                        'a configuration object.');
    }

    if (program.confDir) ignoredOptions.push('--confDir');
    if (program.logDir) ignoredOptions.push('--logDir');
    if (program.gamesDir) ignoredOptions.push('--gamesDir');
    if (program.debug) ignoredOptions.push('--debug');
    if (program.infoQuery) ignoredOptions.push('--infoQuery');
}
else {

    options = {

        // Additional conf directory.
        confDir: confDir,

        // Log Dir
        logDir: logDir,

        servernode: function(servernode) {
            // Special configuration for the ServerNode object.

            // Adds a new game directory (Default is nodegame-server/games).
            servernode.gamesDirs.push(gamesDir);

            // Sets the debug mode, exceptions will be thrown, if TRUE.
            if ('undefined' !== typeof debug) {
                servernode.debug = debug;
            }
            // Can get information from /?q=, if TRUE
            if ('undefined' !== typeof infoQuery) {
                servernode.enableInfoQuery = infoQuery;
            }
            // Basepath (without trailing slash).
            // servernode.basepath = '/mybasepath';

            return true;
        },
        // http: function(http) {
        //     // Special configuration for Express goes here.
        //     return true;
        // },
        // sio: function(sio) {
        //     // Special configuration for Socket.Io goes here here.
        //     // Might not work in Socket.IO 1.x (check).
        //
        //     // sio.set('transports', ['xhr-polling']);
        //     // sio.set('transports', ['jsonp-polling']);
        //
        //     // sio.set('transports', [
        //     //   'websocket'
        //     // , 'flashsocket'
        //     // , 'htmlfile'
        //     // , 'xhr-polling'
        //     // , 'jsonp-polling'
        //     // ]);
        //
        //     return true;
        // }
    };

    // Validate other options.
    if (program.confDir) {
        if (!fs.existsSync(program.confDir)) {
            return printErr('--confDir ' + program.confDir + ' not found.');
        }
        confDir = program.confDir;
    }
    if (program.logDir) {
        if (!fs.existsSync(program.logDir)) {
            return printErr('--logDir ' + program.logDir + ' not found.');
        }
        logDir = program.logDir;
    }
    if (program.gamesDir) {
        if (!fs.existsSync(program.gamesDir)) {
            return printErr('--gamesDir ' + program.gamesDir + ' not found.');
        }
        gamesDir = program.gamesDir;
    }
    if (program.debug) debug = true;

    // Parse infoQuery.
    if (program.infoQuery) {
        if ('boolean' === typeof program.infoQuery) {
            infoQuery = program.infoQuery;
        }
        else {
            let i = program.infoQuery.toLowerCase();
            infoQuery = i === 'f' || i === 'false' || i === '0' ? false : true;
        }
    }
}

// Validate general options.

if ('boolean' === typeof program.ssl) {
    options.ssl = true;
}
else if ('string' === typeof program.ssl) {
    options.ssl = (function(dir) {
        var ssl;

        dir = path.resolve(dir) + '/';
        if (!fs.existsSync(dir)) {
            printErr('ssl directory not found: ' + dir);
            return;
        }

        key = dir + 'private.key';
        if (!fs.existsSync(key)) {
            printErr('ssl private key not found: ' + key);
            return;
        }
        cert = dir + 'certificate.pem';
        if (!fs.existsSync(cert)) {
            printErr('ssl certificate not found: ' + cert);
            return;
        }

        ssl = {};
        ssl.key = fs.readFileSync(key, 'utf8');
        ssl.cert = fs.readFileSync(cert, 'utf8');

        return ssl;

    })(program.ssl);
    if (!options.ssl) return;
}

if (program['default']) {
    options.defaultChannel = program['default'];
}

if (program.port) {
    port = J.isInt(program.port, 0);
    if (!port) {
        return printErr('--port ' + program.port +
                        ' is not a positive number.');
    }
    options.port = port;
}

if (program.logLevel) {
    options.logLevel = program.logLevel;
}

if (program.nClients) {
    if (!program.phantoms) ignoredOptions.push('--nClients');
    else {
        nClients = parseInt(program.nClients, 10);
        if (isNaN(nClients)) {
            return printErr('--nClients ' + program.nClients +
                            ' is invalid.');
        }
    }
}
if (program.clientType) {
    if (!program.phantoms) ignoredOptions.push('--clientType');
    else clientType = program.clientType;
}
if (program.runTests) {
    if (!program.runTests) ignoredOptions.push('--runTests');
    else runTests = program.runTests;
}
if (program.killServer) {
    if (!program.phantoms) ignoredOptions.push('--killServer');
    else killServer = true;
}
if (program.wait) {
    if (!program.phantoms) {
        ignoredOptions.push('--wait');
    }
    else {
        if (true === program.wait) {
            wait = 1000;
        }
        else {
            wait = J.isInt(program.wait, 0);
            if (false === wait) {
                printErr('--wait must be a positive number or undefined. ' +
                         'Found:' + program.wait);
                process.exit();
            }
        }
    }
}
if (program.auth) {
    if (!program.phantoms) {
        ignoredOptions.push('--auth');
    }
    else if ('string' === typeof program.auth) {

        auth = (function(idIdx, pwdIdx) {
            var auth;
            idIdx = program.auth.indexOf('id:');
            if (idIdx === 0) {
                pwdIdx = program.auth.indexOf('&pwd:');
                if (pwdIdx !== -1) {
                    auth = {
                        id: program.auth.substr(3, (pwdIdx-3)),
                        pwd: program.auth.substr(pwdIdx+5)
                    };
                }
                else {
                    printErr('--auth must be a client id or id and ' +
                             'pwd in the form "id:123&pwd:456"');
                    process.exit();
                }
            }
            else if (program.auth === 'new') {
                auth = 'createNew';
            }
            else if (program.auth === 'next') {
                auth = 'nextAvailable';
            }
            else if (program.auth.indexOf('file:') === 0) {
                NDDB = require('NDDB').NDDB;
                codesDb = new NDDB();
                codesDb.loadSync(program.auth.substr(5));
                if (!codesDb.size()) {
                    printErr('--auth no auth codes found: program.auth');
                    process.exit();
                }
                codesDb = codesDb.db;
            }
            else {
                auth = program.auth;
            }
            return auth;
        })();
    }
    else if ('boolean' === typeof program.auth) {
        auth = 'createNew';
    }
    else if ('number' === typeof program.auth ||
             'object' === typeof program.auth) {

        auth = program.auth;
    }
}

// Rebuild server files as needed.

if (program.build) {
    (function() {
        var i, len, opts, modules;
        var info, module, out;
        var cssAlso, cssOnly;

        len = program.build.length;
        if (!len) {
            program.build = [ 'client' ];
        }
        else if (len === 1) {
            if (program.build[0] === 'all') {
                // Client will be done anyway.
                program.build = [ 'window', 'widgets', 'JSUS', 'NDDB' ];
            }
            else if (program.build[0] === 'css') {
                cssOnly = true;
            }
        }

        info = J.resolveModuleDir('nodegame-server', __dirname);
        info = require(path.resolve(info, 'bin', 'info.js'));

        if (!cssOnly) {
            out = 'nodegame-full.js';

            modules = {
                window: 'window',
                client: 'client',
                widgets: 'widgets',
                JSUS: 'JSUS',
                NDDB: 'NDDB',
                css: 'css'
            };

            // Starting build.
            i = -1, len = program.build.length;
            for ( ; ++i < len ; ) {
                module = program.build[i];
                if (!modules[module]) {
                    throw new Error('unknown build component: ' + module);
                }
                // Will be done last anyway.
                if (module === 'client') {
                    continue;
                }
                else if (module === 'NDDB') {
                    console.log('NDDB does not require build.');
                    continue;
                }
                else if (module === 'css') {
                    cssAlso = true;
                    continue;
                }

                opts = { all: true, clean: true };

                info.build[module](opts);
                console.log('');
            }
            // Do client last.
            info.build.client({
                clean: true,
                all: true,
                output: out
            });
            J.copyFile(path.resolve(info.modulesDir.client, 'build', out),
                       path.resolve(info.serverDir.build, 'nodegame-full.js'));
            console.log(info.serverDir.build + out + ' rebuilt.');
            console.log('');
        }

        if (cssAlso || cssOnly) {
            info.build.css(info.serverDir.css, function(err) {
                if (!err) {
                    console.log();
                    startServer();
                }
            });
        }
        else {
            startServer();
        }

    })(program.build);
}
else {
    startServer();
}

// ## Helper functions.

function startServer() {
    // Print warnings, if any.
    printIgnoredOptions();

    console.log('nodeGame v.' + version);
    // Add nodeGame version (might be higher than server version) to options.
    options.nodeGameVersion = version;

    // Start server, options parameter is optional.
    sn = new ServerNode(options);

    sn.ready(function() {
        var channel;
        var i, phantoms;
        var startPhantom, handleGameover;
        var gameName, gameDir, queryString;
        var numFinished;

        // If there are not bots to add returns.
        if (!program.phantoms) return;

        gameName = program.phantoms;
        channel = sn.channels[gameName];
        if (!channel) {
            printErr('channel ' + gameName + ' was not found.');
            if (killServer) process.exit();
            return;
        }

        if (auth && !channel.gameInfo.auth.enabled) {
            printErr('auth option enabled, but channel does not support it.');
            process.exit();
        }

        gameDir = sn.channels[gameName].getGameDir();

        if (clientType) queryString = '?clientType=' + clientType;

        if (killServer || runTests) {
            handleGameover = function() {
                var command, testProcess;

                console.log();
                console.log(gameName + ' game has run successfully.');
                console.log();

                if (runTests) {
                    command = path.resolve(gameDir, 'node_modules', '.bin', 'mocha');
                    if (fs.existsSync(command)) {

                        // Write and backup settings file.
                        writeSettingsFile(gameDir);

                        command += ' ' + gameDir + 'test/ --colors';
                        testProcess = exec(command,
                                           function(err, stdout, stderr) {
                                               if (stdout) console.log(stdout);
                                               if (stderr) console.log(stderr);
                                               testProcess.kill();
                                               if (killServer) process.exit();
                                           });
                    }
                    else {
                        printErr('Cannot run tests, mocha not found: ',
                                 command);
                    }
                }
                else if (killServer) process.exit();
            };
        }


        startPhantom = function(i) {
            var str, config;
            str = 'Connecting phantom #' + (i+1) + '/' + nClients;
            if (codesDb) {
                config = { queryString: queryString, auth: codesDb[i] };
            }
            else {
                config = { queryString: queryString, auth: auth };
            }
            if (config.auth) {
                if (config.auth.id) {
                    str += ' id: ' + config.auth.id;
                    if (config.auth.pwd) str += ' pwd: ' + config.auth.pwd;
                }
                else {
                    str += ' ' + config.auth;
                }
            }
            console.log(str);
            phantoms[i] = channel.connectPhantom(config);
            if ('undefined' !== typeof handleGameover) {
                // Wait for all PhantomJS processes to exit, then stop server.
                phantoms[i].on('exit', function(code) {
                    numFinished ++;
                    if (numFinished === nClients) {
                        handleGameover();
                    }
                });
            }
        };

        phantoms = [], numFinished = 0;
        for (i = 0; i < nClients; ++i) {
            if (i > 0 && wait) {
                (function(i) {
                    setTimeout(function() { startPhantom(i); }, wait * i);
                })(i);
            }
            else {
                startPhantom(i);
            }
        }

        // TODO: Listen for room creation instead of timeout.
        //setTimeout(function() {
        //    var node;
        //    node = sn.channels.ultimatum.gameRooms["ultimatum1"].node;
        //    node.events.ee.ng.on(
        //    'GAME_OVER', function() {console.log('The game is over now.');});
        //}, 5000);


    });

    return sn;
}

function printIgnoredOptions() {
    if (ignoredOptions.length) {
        console.log('    ignored options:', ignoredOptions.join(', '));
        console.log();
        console.log();
    }
}

function printErr(err) {
    console.log('    Check the input parameters.');
    console.log('    Error: ' + err);
}

function writeSettingsFile(gameDir) {
    var settings, settingsFile, bak;
    settings = 'module.exports = { numPlayers: ' + nClients + ' };';
    settingsFile = path.resolve(gameDir, 'test', 'settings.js');
    // Make a backup of existing settings file, if found.
    if (fs.existsSync(settingsFile)) {
        bak = fs.readFileSync(settingsFile).toString();
        fs.writeFileSync(settingsFile + '.bak', bak);
    }
    // Write updated settings file.
    fs.writeFileSync(path.resolve(gameDir, 'test', 'settings.js'), settings);
}

// Exports the ServerNode instance.
module.exports = sn;
