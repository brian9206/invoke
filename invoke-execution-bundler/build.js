const { buildModule, patchModule } = require('./utils');

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

    patchModule('stream', (content) => {
        // only 1 require("stream")
        return content.replace('require("stream")', '{}');
    });

    // punycode
    await buildModule({ 
        moduleName: 'punycode/', 
        exportModuleName: 'punycode'
    });

    // fetch
    await buildModule({ 
        moduleName: 'node-fetch', 
        exportModuleName: 'node-fetch'
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