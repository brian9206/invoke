const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const chalk = require('chalk');

const externalModules = fs.readFileSync(path.resolve(__dirname, 'external-modules.txt'), 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));

console.log(chalk.gray('External modules to exclude from bundle:', externalModules.join(', ')));

const bundleRoot = path.resolve(__dirname, '../../bundles');
console.log('Bundle root directory:', bundleRoot);

async function buildModule(options) {
    let { moduleName, exportModuleName, inputFileName, globalThisExports } = options;
    const fullOutputPath = path.resolve(bundleRoot, 'vm-modules', exportModuleName + '.js');

    globalThisExports = globalThisExports || [];

    const esbuildOptions = {
        stdin: {
            contents: `module.exports = require('${moduleName}');` + globalThisExports.map(exportName => exportName === 'this' ? `globalThis['${exportName}'] = module.exports;` : `globalThis['${exportName}'] = module.exports['${exportName}'];`).join('\n'),
            resolveDir: path.resolve(__dirname, '..'),
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
        esbuildOptions.entryPoints = [path.resolve(__dirname, inputFileName)];
    }

    console.log(`Building module: ${exportModuleName} -> ${fullOutputPath}`);
    await esbuild.build(esbuildOptions);
}

function patchModule(moduleName, patchFunction) {
    const modulePath = path.resolve(bundleRoot, 'vm-modules', moduleName + '.js');
    console.log(`Patching module: ${moduleName} -> ${modulePath}`);

    let moduleContent = fs.readFileSync(modulePath, 'utf-8');
    moduleContent = patchFunction(moduleContent);
    fs.writeFileSync(modulePath, moduleContent, 'utf-8');
}

module.exports = { buildModule, patchModule, bundleRoot, externalModules };
