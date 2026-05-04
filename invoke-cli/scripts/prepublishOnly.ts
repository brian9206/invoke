import fs from 'fs'
import path from 'path'

const packageJsonPath = path.resolve(__dirname, '../package-template.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

packageJson.dependencies = {}
packageJson.devDependencies = {}

const outputPath = path.resolve(__dirname, '../package.json')
fs.writeFileSync(outputPath, JSON.stringify(packageJson, null, 2))

console.log('Generated package.json for publish.')

const invokeContent = `#!/usr/bin/env node\nconsole.log('Invoke CLI binary is not installed. Please run "npm install -g invoke-cli" again to retry installation.');`

fs.writeFileSync(path.resolve(__dirname, '../dist/invoke'), invokeContent)
fs.chmodSync(path.resolve(__dirname, '../dist/invoke'), 0o777)

console.log('Placeholder invoke CLI binary created.')
