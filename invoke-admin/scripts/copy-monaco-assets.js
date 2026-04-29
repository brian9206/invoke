const path = require('path')
const fs = require('fs-extra')

async function copyMonacoAssets() {
  const sourceDir = path.dirname(require.resolve('monaco-editor/min/vs/loader.js'))
  const targetDir = path.join(__dirname, '..', 'public', 'monaco', 'vs')

  await fs.ensureDir(targetDir)
  await fs.copy(sourceDir, targetDir, { overwrite: true })
}

copyMonacoAssets().catch(error => {
  console.error('Failed to copy Monaco assets', error)
  process.exitCode = 1
})
