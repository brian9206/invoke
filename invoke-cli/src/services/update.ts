import path from 'path'
import axios from 'axios'
import chalk from 'chalk'
import { ensureConfigDir } from './config'

async function getLatestRelease() {
  const res = await axios.get('https://api.github.com/repos/brian9206/invoke/releases/latest')
  const release = res.data
  return release
}

export async function getLatestBinaryUrl() {
  const release = await getLatestRelease()

  const platform = process.platform
  const arch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : null

  if (!arch) {
    throw new Error(`Unsupported architecture: ${process.arch}`)
  }

  const assetName = `invoke-${platform}-${arch}`
  const asset = release.assets.find((a: any) => a.name.startsWith(assetName))

  if (!asset) {
    throw new Error(`No binary available for platform ${platform} and architecture ${arch}`)
  }

  return asset.browser_download_url
}

export async function checkForUpdates() {
  try {
    const configFile = path.join(ensureConfigDir(), 'last_update_check')

    if (await Bun.file(configFile).exists()) {
      const lastCheck = parseInt(await Bun.file(configFile).text(), 10)
      const now = Date.now()

      // Check for updates at most once every 24 hours
      if (now - lastCheck < 24 * 60 * 60 * 1000) {
        return
      }
    }

    const release = await getLatestRelease()

    if (release?.tag_name && release.tag_name !== 'v' + process.env.INVOKE_CLI_VERSION) {
      console.log(
        `\n${chalk.yellow('⚡ A new version of Invoke CLI is available!')} ${chalk.grey('v' + (process.env.INVOKE_CLI_VERSION || '0.0.0'))} -> ${chalk.cyan(release.tag_name)}`
      )
      console.log(chalk.grey(`Run ${chalk.cyan('npm install -g invoke-cli')} to update.`))
    }

    await Bun.write(configFile, Date.now().toString())
  } catch (error) {
    console.error(`\n${chalk.grey('Error checking for updates: ' + error)}`)
  }
}
