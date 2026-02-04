const esbuild = require('esbuild');
const path = require('path');
const { buildModule, bootstrapDir, externalModules } = require('./utils');

(async () => {

    // events
    await buildModule({ 
        moduleName: 'events/', 
        exportModuleName: 'events', 
        outputFileName: '30_modules/10_events.js',
        globalThisExports: ['EventEmitter']
    });

    // buffer
    await buildModule({ 
        moduleName: 'buffer/', 
        exportModuleName: 'buffer', 
        outputFileName: '30_modules/20_buffer.js',
        inputFileName: './modules/buffer.js',
    });

    // stream
    await buildModule({ 
        moduleName: 'readable-stream', 
        exportModuleName: 'stream', 
        outputFileName: '30_modules/30_stream.js' 
    });

    // punycode
    await buildModule({ 
        moduleName: 'punycode/', 
        exportModuleName: 'punycode', 
        outputFileName: '30_modules/punycode.js' 
    });

    // fetch
    console.log(`Building module: fetch -> ${path.resolve(bootstrapDir, '40_fetch.js')}`);
    await esbuild.build({
        entryPoints: [path.resolve(process.cwd(), './modules/fetch.js')],
        outfile: path.resolve(bootstrapDir, '40_fetch.js'),
        bundle: true,
        keepNames: true,
        platform: 'node',
        format: 'iife',
        external: externalModules
    });

    // assert
    await buildModule({ 
        moduleName: 'assert/', 
        exportModuleName: 'assert', 
        outputFileName: '30_modules/assert.js' 
    });

    // string_decoder
    await buildModule({ 
        moduleName: 'string_decoder/', 
        exportModuleName: 'string_decoder', 
        outputFileName: '30_modules/string_decoder.js' 
    });

    console.log('All done');

})();