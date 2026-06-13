import chalk from 'chalk'
import fs from 'fs'
import path from 'path'
import inquirer from 'inquirer'
import type { Command } from 'commander'
import stack from '../config/stack.json'
import { TEMPLATES } from '../config/templates'

interface StackLanguage {
  name: string
  displayName: string
  runtimes: string[]
  templates: Array<{ path: string; displayName: string; description: string }>
}

interface StackRuntime {
  name: string
  displayName: string
}

const languages = stack.languages as StackLanguage[]
const runtimes = stack.runtimes as StackRuntime[]

export function register(program: Command): void {
  program
    .command('init')
    .description('Scaffold a new function directory from a template')
    .argument('[path]', 'Directory to create (defaults to function name)')
    .option('--name <name>', 'Function name')
    .option('--language <language>', 'Language (e.g. javascript, typescript, csharp)')
    .option('--runtime <runtime>', 'Runtime (e.g. bun, dotnet)')
    .option('--template <template>', 'Template path (e.g. bun-typescript-function)')
    .action(async (dirPath: string | undefined, options: any) => {
      try {
        // ── Step 1: Function name ────────────────────────────────────────
        let name: string = options.name?.trim() || ''
        if (!name) {
          const answer = await inquirer.prompt([
            {
              type: 'input',
              name: 'name',
              message: 'Function name:',
              validate: (v: string) => v.trim() !== '' || 'Name is required'
            }
          ])
          name = answer.name.trim()
        }

        // ── Step 2: Language ─────────────────────────────────────────────
        let languageName: string = options.language?.trim().toLowerCase() || ''
        if (!languageName) {
          const answer = await inquirer.prompt([
            {
              type: 'list',
              name: 'language',
              message: 'Language:',
              choices: languages.map(l => ({ name: l.displayName, value: l.name }))
            }
          ])
          languageName = answer.language
        }

        const langEntry = languages.find(l => l.name === languageName)
        if (!langEntry) {
          console.error(chalk.red(`❌ Unknown language: ${languageName}`))
          process.exit(1)
        }

        // ── Step 3: Runtime ──────────────────────────────────────────────
        let runtimeName: string = options.runtime?.trim().toLowerCase() || ''
        if (!runtimeName) {
          const runtimeChoices = langEntry.runtimes.map(r => {
            const rt = runtimes.find(x => x.name === r)
            return { name: rt?.displayName || r, value: r }
          })
          const answer = await inquirer.prompt([
            {
              type: 'list',
              name: 'runtime',
              message: 'Runtime:',
              choices: runtimeChoices
            }
          ])
          runtimeName = answer.runtime
        }

        if (!langEntry.runtimes.includes(runtimeName)) {
          console.error(chalk.red(`❌ Runtime "${runtimeName}" is not supported for language "${languageName}"`))
          process.exit(1)
        }

        // ── Step 4: Template ─────────────────────────────────────────────
        let templatePath: string = options.template?.trim() || ''
        if (!templatePath) {
          const answer = await inquirer.prompt([
            {
              type: 'list',
              name: 'template',
              message: 'Template:',
              choices: langEntry.templates.map(t => ({ name: `${t.displayName} — ${t.description}`, value: t.path }))
            }
          ])
          templatePath = answer.template
        }

        const templateEntry = langEntry.templates.find(t => t.path === templatePath)
        if (!templateEntry) {
          console.error(chalk.red(`❌ Unknown template: ${templatePath}`))
          process.exit(1)
        }

        // ── Resolve paths ────────────────────────────────────────────────
        const resolvedDirPath = dirPath || name
        const absPath = path.resolve(resolvedDirPath)

        if (fs.existsSync(absPath)) {
          console.error(chalk.red(`❌ Directory already exists: ${absPath}`))
          process.exit(1)
        }

        const templateFiles = TEMPLATES[templatePath]
        if (!templateFiles) {
          console.error(chalk.red(`❌ Template not found: ${templatePath}`))
          process.exit(1)
        }

        // ── Write embedded template files ────────────────────────────────
        fs.mkdirSync(absPath, { recursive: true })
        for (const [relPath, content] of Object.entries(templateFiles)) {
          const destFile = path.join(absPath, relPath)
          fs.mkdirSync(path.dirname(destFile), { recursive: true })
          // Patch package.json name field inline
          if (relPath === 'package.json') {
            const pkg = JSON.parse(content)
            pkg.name = name
            fs.writeFileSync(destFile, JSON.stringify(pkg, null, 2) + '\n')
          } else {
            fs.writeFileSync(destFile, content)
          }
        }

        // ── Output ───────────────────────────────────────────────────────
        console.log(chalk.green(`\n✅ Created function directory: ${absPath}`))

        const files = fs.readdirSync(absPath)
        files.forEach(f => console.log(chalk.cyan(`  📄 ${f}`)))

        console.log('')
        console.log(chalk.white('Next steps:'))
        console.log(chalk.white(`  cd ${resolvedDirPath}`))
        console.log(
          chalk.white(
            `  invoke function:deploy . --function @<project-slug>/${name} --language ${languageName} --runtime ${runtimeName}`
          )
        )
      } catch (error: any) {
        console.error(chalk.red('❌ Init failed:'), error.message)
        process.exit(1)
      }
    })
}
