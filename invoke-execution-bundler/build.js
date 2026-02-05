const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { buildModule, bootstrapDir, externalModules, moduleDir } = require('./utils');

(async () => {

    // events
    await buildModule({ 
        moduleName: 'events/', 
        exportModuleName: 'events'
    });

    // buffer
    await buildModule({ 
        moduleName: 'buffer/', 
        exportModuleName: 'buffer', 
        inputFileName: './modules/buffer.js'
    });

    // stream
    await buildModule({ 
        moduleName: 'readable-stream', 
        exportModuleName: 'stream'
    });
    const streamModulePath = path.resolve(moduleDir, 'stream.js');
    const streamModuleContent = fs.readFileSync(streamModulePath, 'utf-8');
    fs.writeFileSync(streamModulePath, streamModuleContent.replace('require("stream")', '{}'), 'utf-8');

    // punycode
    await buildModule({ 
        moduleName: 'punycode/', 
        exportModuleName: 'punycode'
    });

    // fetch
    console.log(`Building module: fetch -> ${path.resolve(bootstrapDir, '30_fetch.js')}`);
    await esbuild.build({
        entryPoints: [path.resolve(process.cwd(), './modules/fetch.js')],
        outfile: path.resolve(bootstrapDir, '30_fetch.js'),
        bundle: true,
        keepNames: true,
        platform: 'node',
        format: 'iife',
        external: externalModules
    });

    // assert
    await buildModule({ 
        moduleName: 'assert/', 
        exportModuleName: 'assert'
    });

    // string_decoder
    await buildModule({ 
        moduleName: 'string_decoder/', 
        exportModuleName: 'string_decoder'
    });

    console.log('All done');

})();