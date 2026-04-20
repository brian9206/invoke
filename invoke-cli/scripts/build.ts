import path from 'path';
import { Listr } from 'listr2'

const { version, targets } = require(path.resolve(__dirname, '../build.json')) as { version: string, targets: string[] };
console.log(`Build version: v${version}`);

const runner = new Listr<string>(targets.map(target => ({
  title: `Building ${target}`,
  task: async () => {
    await Bun.build({
      entrypoints: [path.resolve(__dirname, "../src/index.ts")],
      compile: {
        target: `bun-${target}` as any,
        outfile: path.resolve(__dirname, `../dist/invoke-${target}`),
        autoloadPackageJson: true,
        execArgv: ["--smol"],
      },
      minify: true,
      bytecode: true,
      define: {
        'process.env.INVOKE_CLI_VERSION': JSON.stringify(version),
      }
    })
  }
})), {
  concurrent: true,
});

runner.run();