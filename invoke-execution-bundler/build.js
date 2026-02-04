const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const externalModules = fs.readFileSync('./external-modules.txt', 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));

console.log('External modules to exclude from bundle:', externalModules);

const bootstrapDir = path.resolve(__dirname, '../invoke-execution/services/vm-bootstrap');
console.log('Bootstrap directory:', bootstrapDir);

async function buildModule(options) {
    let { moduleName, outputFileName, exportModuleName, inputFileName, globalThisExports } = options;
    const fullOutputPath = path.resolve(bootstrapDir, outputFileName);

    globalThisExports = globalThisExports || [];

    const esbuildOptions = {
        stdin: {
            contents: `module.exports = require('${moduleName}');` + globalThisExports.map(exportName => exportName === 'this' ? `globalThis['${exportName}'] = module.exports;` : `globalThis['${exportName}'] = module.exports['${exportName}'];`).join('\n'),
            resolveDir: process.cwd(),
            sourcefile: exportModuleName + '.js',
            loader: 'js'
        },
        write: false,
        bundle: true,
        keepNames: true,
        platform: 'node',
        format: 'iife',
        globalName: `builtinModule['${exportModuleName}']`,
        external: externalModules.filter(module => module !== moduleName && module !== exportModuleName),
    };

    if (inputFileName) {
        esbuildOptions.stdin = undefined;
        esbuildOptions.entryPoints = [path.resolve(process.cwd(), inputFileName)];
    }
    
    console.log(`Building module: ${exportModuleName} -> ${fullOutputPath}`);
    const res = await esbuild.build(esbuildOptions);

    fs.writeFileSync(fullOutputPath, res.outputFiles[0].text.replace('var builtinModule;\n', ''), 'utf-8');
}

(async () => {

    // Events
    await buildModule({ 
        moduleName: 'events/', 
        exportModuleName: 'events', 
        outputFileName: '30_modules/10_events.js',
        globalThisExports: ['EventEmitter']
    });

    // Buffer
    await buildModule({ 
        moduleName: 'buffer/', 
        exportModuleName: 'buffer', 
        outputFileName: '30_modules/20_buffer.js',
        inputFileName: './modules/buffer.js',
    });

    // Stream
    await buildModule({ 
        moduleName: 'readable-stream', 
        exportModuleName: 'stream', 
        outputFileName: '30_modules/30_stream.js' 
    });

    // Punycode
    await buildModule({ 
        moduleName: 'punycode/', 
        exportModuleName: 'punycode', 
        outputFileName: '30_modules/punycode.js' 
    });

    // Fetch API
    console.log(`Building module: fetch -> ${path.resolve(bootstrapDir, '40_fetch.js')}`);
    await esbuild.build({
        entryPoints: [path.resolve(process.cwd(), './modules/fetch.js')],
        outfile: path.resolve(bootstrapDir, '40_fetch.js'),
        bundle: true,
        keepNames: true,
        platform: 'node',
        format: 'iife',
    });

    console.log('All done');

})();