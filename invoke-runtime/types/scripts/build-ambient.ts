import { Glob } from 'bun'
import { resolve, relative, basename } from 'path'
import * as prettier from 'prettier'

const typesDir = resolve(import.meta.dir, '../dist')
const outFile = resolve(import.meta.dir, '../dist/ambient.d.ts')

// Collect all .d.ts files
const glob = new Glob('**/*.d.ts')
const files: string[] = []
for await (const path of glob.scan(typesDir)) {
  if (basename(path) === basename(outFile)) continue // Skip existing ambient.d.ts
  files.push(resolve(typesDir, path))
}

// Track imported names and defined names for unresolved-import placeholders
const importedNames = new Map<string, string>() // name → source module
const definedNames = new Set<string>()

const sections: string[] = []

for (const file of files) {
  const content = await Bun.file(file).text()
  const lines = content.split('\n')
  const outputLines: string[] = []
  let inDeclareGlobal = false
  let braceDepth = 0

  for (const line of lines) {
    const trimmed = line.trim()

    // Track defined names (before transforms, on original line)
    const defMatch = trimmed.match(/^(?:export\s+)?(?:declare\s+)?(?:class|interface|type|enum|const|function)\s+(\w+)/)
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
              .pop()!
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
      // Dedent one level (4 spaces)
      outputLines.push(line.replace(/^    /, ''))
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
const placeholders: string[] = []
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

const output = `
/// <reference types="node" />
/// <reference types="bun" />

declare global {
${placeholders.length ? placeholders.join('\n') + '\n\n' : ''}${body}
}

export {};
`

const formatted = await prettier.format(output.trim(), { parser: 'typescript', tabWidth: 2, useTabs: false })

await Bun.write(outFile, formatted)
console.log(`Written to ${resolve(relative(process.cwd(), outFile))}`)
