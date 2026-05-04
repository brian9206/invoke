const path = require('path')
const fs = require('fs-extra')
const { globSync } = require('fs-extra')

function resolveDts(name) {
  const paths = require.resolve.paths(name)
  for (const p of paths) {
    const fullPath = path.join(p, name, 'index.d.ts')
    if (fs.existsSync(fullPath)) return path.dirname(fullPath)
  }
  return null
}

async function buildPackageTypes(package, alias) {
  const sourceDir = resolveDts(package)
  const targetDir = path.join(__dirname, '..', 'public', 'monaco', '@types', alias)

  const files = globSync('**/*.d.ts', { cwd: sourceDir, absolute: false })

  for (const file of files) {
    const sourcePath = path.join(sourceDir, file)
    const targetPath = path.join(targetDir, file)
    await fs.ensureDir(path.dirname(targetPath))
    await fs.copyFile(sourcePath, targetPath)
  }

  await fs.writeFile(path.join(targetDir, 'index.json'), JSON.stringify(files))
}

async function main() {
  const sourceDir = path.dirname(require.resolve('monaco-editor/min/vs/loader.js'))
  const targetDir = path.join(__dirname, '..', 'public', 'monaco', 'vs')

  await fs.ensureDir(targetDir)
  await fs.copy(sourceDir, targetDir, { overwrite: true })

  await fs.copy(
    path.resolve(path.dirname(require.resolve('invoke-types/package.json')), 'dist/editor.d.ts'),
    path.resolve(__dirname, '..', 'public', 'monaco', '@types', 'invoke-ambient.d.ts'),
    { overwrite: true }
  )

  await buildPackageTypes('@types/node', 'node')
  await buildPackageTypes('bun-types', 'bun')
}

main().catch(error => {
  console.error('Failed to copy Monaco assets', error)
  process.exitCode = 1
})
