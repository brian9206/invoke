const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const externalModules = fs.readFileSync('./external-modules.txt', 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));

console.log('External modules to exclude from bundle:', externalModules);

const moduleDir = path.resolve(__dirname, '../invoke-execution/services/vm-modules');
const bootstrapDir = path.resolve(__dirname, '../invoke-execution/services/vm-bootstrap');
console.log('Module directory:', moduleDir);
console.log('Bootstrap directory:', bootstrapDir);

async function buildModule(options) {
    let { moduleName, exportModuleName, inputFileName, globalThisExports } = options;
    const fullOutputPath = path.resolve(moduleDir, exportModuleName + '.js');

    globalThisExports = globalThisExports || [];

    const esbuildOptions = {
        stdin: {
            contents: `module.exports = require('${moduleName}');` + globalThisExports.map(exportName => exportName === 'this' ? `globalThis['${exportName}'] = module.exports;` : `globalThis['${exportName}'] = module.exports['${exportName}'];`).join('\n'),
            resolveDir: process.cwd(),
            sourcefile: exportModuleName + '.js',
            loader: 'js'
        },
        outfile: fullOutputPath,
        bundle: true,
        keepNames: true,
        platform: 'node',
        format: 'cjs',
        external: externalModules.filter(module => module !== moduleName && module !== exportModuleName),
    };

    if (inputFileName) {
        esbuildOptions.stdin = undefined;
        esbuildOptions.entryPoints = [path.resolve(process.cwd(), inputFileName)];
    }
    
    console.log(`Building module: ${exportModuleName} -> ${fullOutputPath}`);
    await esbuild.build(esbuildOptions);
}

module.exports = { buildModule, moduleDir, bootstrapDir, externalModules };