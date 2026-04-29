import fs from 'fs'
import path from 'path'

const packageJsonPath = path.resolve(__dirname, '../package-template.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

const outputPath = path.resolve(__dirname, '../package.json')
fs.writeFileSync(outputPath, JSON.stringify(packageJson, null, 2))

console.log('Restored package.json for development.')
