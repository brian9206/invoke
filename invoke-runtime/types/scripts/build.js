const fs = require('fs/promises')
const path = require('path')
const { Glob } = require('glob')
const prettier = require('prettier')
const { program } = require('commander')
const chalk = require('chalk').default

const AMBIENT_TEMPLATE = `
/// <reference types="bun" />

declare global {
$$CONTENT$$
}

export {};
`

const EDITOR_TEMPLATE = `
$$CONTENT$$

declare var req: InvokeRequest;
declare var res: InvokeResponse;
declare var next: (err?: unknown) => void;
`

async function build(typesDir, options) {
  if (options.target && !['ambient', 'editor'].includes(options.target)) {
    throw new Error('Invalid target. Must be "ambient" or "editor".')
  }

  // Collect all .d.ts files
  const glob = new Glob(path.resolve(typesDir, '**/*.d.ts'), {})
  const files = []
  for await (const p of glob) {
    files.push(path.resolve(typesDir, p))
  }

  // Track imported names and defined names for unresolved-import placeholders
  const importedNames = new Map() // name → source module
  const definedNames = new Set()

  const sections = []

  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8')
    const lines = content.split('\n')
    const outputLines = []
    let inDeclareGlobal = false
    let braceDepth = 0

    for (const line of lines) {
      const trimmed = line.trim()

      // Track defined names (before transforms, on original line)
      const defMatch = trimmed.match(
        /^(?:export\s+)?(?:declare\s+)?(?:class|interface|type|enum|const|function)\s+(\w+)/
      )
      if (defMatch) definedNames.add(defMatch[1])

      // Remove import lines, tracking imported names
      if (/^import\s/.test(trimmed)) {
        const match = trimmed.match(/import\s+(?:type\s+)?{([^}]+)}\s+from\s+['"]([^'"]+)['"]/)
        if (match) {
          const names = match[1]
            .split(',')
            .map(n =>
              n
                .trim()
                .split(/\s+as\s+/)
                .pop()
                .trim()
            )
            .filter(Boolean)
          const source = match[2]
          for (const name of names) importedNames.set(name, source)
        }
        continue
      }

      // Remove export {}
      if (/^export\s*\{\s*\}\s*;?\s*$/.test(trimmed)) continue

      // Remove re-export lines
      if (/^export\s+\*\s+from\s+/.test(trimmed)) continue
      if (/^export\s+\{[^}]*\}\s+from\s+/.test(trimmed)) continue
      if (/^export\s+type\s+\{[^}]*\}\s+from\s+/.test(trimmed)) continue

      // Handle declare global blocks — unwrap, extract inner content
      if (/^declare\s+global\s*\{/.test(trimmed)) {
        inDeclareGlobal = true
        braceDepth = 1
        continue
      }

      if (inDeclareGlobal) {
        for (const ch of trimmed) {
          if (ch === '{') braceDepth++
          else if (ch === '}') braceDepth--
        }
        if (braceDepth <= 0) {
          inDeclareGlobal = false
          continue
        }

        let processed = line

        if (options.target === 'editor') {
          processed = processed.replace(/^(\s*)(class|function|const|enum)\s/, '$1declare $2 ')
        }

        // Dedent one level (4 spaces)
        outputLines.push(processed.replace(/^    /, ''))
        continue
      }

      // Strip export declare → (nothing, declare is implicit inside declare global)
      let processed = line
      processed = processed.replace(/^(\s*)export\s+declare\s+(class|function|const|enum)\s/, '$1$2 ')
      processed = processed.replace(/^(\s*)export\s+(interface|type)\s/, '$1$2 ')
      processed = processed.replace(/^(\s*)export\s+declare\s+/, '$1')
      processed = processed.replace(/^(\s*)export\s+(class|function|const|enum)\s/, '$1$2 ')

      outputLines.push(processed)
    }

    const sectionContent = outputLines.join('\n').trim()
    if (sectionContent) sections.push(sectionContent)
  }

  // Build unresolved-import placeholders
  const placeholders = []
  for (const [name] of importedNames) {
    if (!definedNames.has(name)) {
      placeholders.push(`    type ${name} = any;`)
    }
  }

  // Assemble output
  const body = sections
    .map(s =>
      s
        .split('\n')
        .map(l => (l ? `    ${l}` : ''))
        .join('\n')
    )
    .join('\n\n')

  const output = (options.target === 'ambient' ? AMBIENT_TEMPLATE : EDITOR_TEMPLATE).replace(
    '$$CONTENT$$',
    `${placeholders.length ? placeholders.join('\n') + '\n\n' : ''}${body}`
  )
  const formatted = await prettier.format(output.trim(), {
    parser: 'typescript',
    tabWidth: 2,
    useTabs: false,
    semi: false,
    singleQuote: true,
    trailingComma: 'none',
    bracketSpacing: true,
    jsxSingleQuote: true,
    arrowParens: 'avoid'
  })

  return formatted
}

program
  .option('--target <type>', 'build target (ambient or editor)')
  .option('--output <file>', 'output file')
  .arguments('<input>')
  .action(async (typesDir, options) => {
    try {
      const outFile = path.resolve(options.output)

      if (!options.output && (!fs.existsSync(outFile) || fs.lstatSync(outFile).isFile())) {
        throw new Error('Invalid output. Must be a file if exists.')
      }

      typesDir = path.resolve(typesDir)

      if (!typesDir && (!fs.existsSync(typesDir) || !fs.lstatSync(typesDir).isDirectory())) {
        throw new Error('Invalid input. Must be a valid directory.')
      }

      const output = await build(typesDir, options)
      await fs.writeFile(outFile, output, 'utf-8')
      console.log(chalk.green(`Successfully built ${options.target}:`), chalk.gray(outFile))
    } catch (err) {
      console.error(chalk.red(err.message ?? err.toString()))
    }
  })

program.parse()
module.exports = build
