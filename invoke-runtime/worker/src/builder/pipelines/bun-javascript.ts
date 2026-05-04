import fs from 'fs/promises'
import path from 'path'
import { copyRecursive, exec } from '../utils'
import { Pipeline } from '../types'

const pipeline: Pipeline = {
  name: 'bun-javascript',
  stages: [
    // Stage: Install dev dependencies (including build tools)
    {
      name: 'install_dev_dependencies',
      run: async () => {
        await exec(['bun', 'install', '--frozen-lockfile'])
      }
    },

    // Stage: Run build script if it exists
    {
      name: 'build',
      dependsOn: ['install_dev_dependencies'],
      run: async () => {
        // Detect build script
        let hasBuildScript = false

        try {
          const packageJson = JSON.parse(await fs.readFile('/app/package.json', { encoding: 'utf-8' }))
          hasBuildScript = !!packageJson?.scripts?.build
        } catch {
          hasBuildScript = false
        }

        if (!hasBuildScript) {
          console.log('No build script detected in package.json')
          return
        }

        await exec(['bun', 'run', 'build'])
      }
    },

    // Stage: Bundle
    {
      name: 'bundle',
      dependsOn: ['build'],
      run: async () => {
        // Detect entrypoint
        const entrypoints = ['/app/index.js', '/app/main.js']

        let entrypoint = ''

        try {
          const packageJson = JSON.parse(await fs.readFile('/app/package.json', { encoding: 'utf-8' }))

          if (!packageJson.main) {
            throw new Error('No "main" field in package.json')
          }

          entrypoint = path.resolve(packageJson.main)
          await fs.access(entrypoint)
        } catch {
          // ignore errors and start guessing entry point
          for (const candidate of entrypoints) {
            try {
              await fs.access(candidate)
              entrypoint = candidate
              break
            } catch {
              // try next candidate
            }
          }
        }

        if (!entrypoint) {
          throw new Error('No entry point found. Expected "main" field in package.json or one of index.js, main.js')
        }

        await exec([
          'bun',
          'build',
          entrypoint,
          '--outdir',
          '/output/artifacts',
          '--target',
          'bun',
          '--minify',
          '--sourcemap'
        ])

        // Verify output was produced
        const outFiles = await fs.readdir('/output/artifacts')
        if (outFiles.length === 0) {
          throw new Error('bun build produced no output files')
        }

        // Copy everything from /app to /output/artifacts (except node_modules) so that user code can require() them
        console.log('Copying project files to output artifacts...')
        await copyRecursive('/app', '/output/artifacts', { exclude: ['node_modules'] })
      }
    },

    // Stage: Copy project files
    {
      name: 'copy_files',
      run: async () => {
        await fs.mkdir('/output/artifacts', { recursive: true })

        // Copy everything from /app to /output/artifacts (except node_modules) so that user code can require() them
        console.log('Copying project files to output artifacts...')
        await copyRecursive('/app', '/output/artifacts', { exclude: ['node_modules'] })
      }
    },

    // Stage: Install production dependencies
    {
      name: 'install_dependencies',
      dependsOn: ['copy_files'],
      run: async () => {
        await exec(['bun', 'install', '--production', '--frozen-lockfile'], { cwd: '/output/artifacts' })
      }
    }
  ]
}

export default pipeline
