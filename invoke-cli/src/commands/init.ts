import chalk from 'chalk'
import fs from 'fs'
import path from 'path'
import type { Command } from 'commander'

const INDEX_JS_TEMPLATE = `const crypto = require('crypto');

module.exports = async function(req, res) {
    const { name = 'World' } = req.query;

    res.setHeader('x-powered-by', 'Invoke');

    const resp = await fetch('http://httpbin.org/json');
    console.log('status is ', resp.status)
    const fetchedData = await resp.json();

    res.json({
        message: \`Hello, \${name}!\`,
        name: {
            base64: Buffer.from(name).toString('base64'),
            sha256: crypto.createHash('sha256').update(name).digest('hex')
        },
        fetchedData,
        timestamp: Date.now()
    });
}
`

function buildPackageJson(name: string, description: string | undefined, project: string): Record<string, any> {
  const projectName = project || 'Default Project'
  return {
    name,
    version: '1.0.0',
    description: description || '',
    license: 'UNLICENSED',
    private: true,
    type: 'commonjs',
    main: 'index.js',
    scripts: {
      start: 'invoke run',
      deploy: `invoke function:deploy --name ${name} --project "${projectName}"`,
      test: `invoke function:test ${name} --path ?name=World`
    }
  }
}

export function register(program: Command): void {
  program
    .command('init')
    .description('Scaffold a new function directory from the hello world template')
    .argument('[path]', 'Directory to create')
    .requiredOption('--name <name>', 'Function name')
    .option('--description <text>', 'Function description')
    .option('--project <project>', 'Project name (used in deploy script)', 'Default Project')
    .action((dirPath: string | undefined, options: any) => {
      const name = options.name.trim()

      if (!name) {
        console.error(chalk.red('❌ --name cannot be empty'))
        process.exit(1)
      }

      const resolvedDirPath = dirPath || name

      const absPath = path.resolve(resolvedDirPath)

      if (fs.existsSync(absPath)) {
        console.error(chalk.red(`❌ Directory already exists: ${absPath}`))
        process.exit(1)
      }

      fs.mkdirSync(absPath, { recursive: true })

      const indexPath = path.join(absPath, 'index.js')
      const pkgPath = path.join(absPath, 'package.json')

      fs.writeFileSync(indexPath, INDEX_JS_TEMPLATE)
      fs.writeFileSync(
        pkgPath,
        JSON.stringify(buildPackageJson(name, options.description, options.project), null, 2) + '\n'
      )

      console.log(chalk.green(`✅ Created function directory: ${absPath}`))
      console.log(chalk.cyan('  📄 index.js'))
      console.log(chalk.cyan('  📄 package.json'))
      console.log('')
      console.log(chalk.white('Next steps:'))
      console.log(chalk.white(`  cd ${resolvedDirPath}`))
      console.log(chalk.white(`  npm start`))
      console.log('')
      console.log(chalk.white('Deploy and test your function:'))
      console.log(chalk.white(`  cd ${resolvedDirPath}`))
      console.log(chalk.white(`  npm run deploy`))
      console.log(chalk.white(`  npm run test`))
    })
}
