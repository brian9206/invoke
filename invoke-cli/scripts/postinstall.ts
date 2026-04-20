import { getLatestBinaryUrl } from '../src/services/update';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';

async function main() {
  try {
    const url = await getLatestBinaryUrl();
    console.log(`Downloading ${url}...`);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download: ${res.statusText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const filePath = path.resolve(path.join(__dirname, '../dist/invoke' + (process.platform === 'win32' ? '.exe' : '')));
    await fs.promises.writeFile(filePath, buffer);
    console.log(`Downloaded latest version to ${filePath}`);

    if (process.platform === 'win32') {
      // update package.json to point to the .exe file
      const packageJsonPath = path.resolve(path.join(__dirname, '../package.json'));
      const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf-8'));
      packageJson.bin.invoke += '.exe';
      await fs.promises.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log(`Updated package.json to point to invoke.exe`);
    }
    else {
      try {
        fs.chmodSync(filePath, 0o755);
      } catch (err) {
        console.warn(chalk.yellow(`Could not set executable permissions on ${filePath}.`));
        console.warn(chalk.yellow(`You may need to run: chmod +x ${filePath}`));
      }
    }
  } catch (error) {
    console.error(`Error during postinstall: ${error}`);
  }
}

main().catch(error => {
  console.error(`Unexpected error during postinstall: ${error}`);
  process.exit(1);
});