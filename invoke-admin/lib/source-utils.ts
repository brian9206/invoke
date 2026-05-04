import fs from 'fs-extra'
import path from 'path'
import AdmZip from 'adm-zip'
import * as tar from 'tar'

const { s3Service } = require('invoke-shared')

export async function ensureS3Initialized(): Promise<void> {
  if (!s3Service.initialized) {
    await s3Service.initialize()
  }
}

export async function downloadAndExtract(
  versionRecord: { package_path?: string; object_key?: string; version?: number; id: string },
  functionId: string,
  tempBaseDir: string
): Promise<{ tempFilePath: string; tempExtractPath: string }> {
  const objectKey =
    (versionRecord as any).object_key ||
    versionRecord.package_path ||
    `functions/${functionId}/v${versionRecord.version}.zip`

  const tempFilePath = path.join(tempBaseDir, `${versionRecord.id}_dl_${Date.now()}`)
  const tempExtractPath = path.join(tempBaseDir, `${versionRecord.id}_ext_${Date.now()}`)

  await fs.ensureDir(tempBaseDir)

  const bucketName = process.env.S3_BUCKET || 'invoke-packages'
  const stream = await s3Service.getObjectStream(bucketName, objectKey)
  const writeStream = fs.createWriteStream(tempFilePath)
  await new Promise<void>((resolve, reject) => {
    stream.on('error', reject)
    writeStream.on('error', reject)
    writeStream.on('finish', resolve)
    stream.pipe(writeStream)
  })

  await fs.ensureDir(tempExtractPath)
  if (objectKey.endsWith('.zip')) {
    const zip = new AdmZip(tempFilePath)
    zip.extractAllTo(tempExtractPath, true)
  } else {
    await tar.x({ file: tempFilePath, cwd: tempExtractPath, strip: 0 })
  }

  const extractedItems = await fs.readdir(tempExtractPath)
  if (extractedItems.length === 0) {
    throw new Error('No files were extracted from the archive')
  }

  return { tempFilePath, tempExtractPath }
}

export async function readDirectoryTree(dirPath: string, relativePath = ''): Promise<any[]> {
  const nodes: any[] = []
  const items = await fs.readdir(dirPath)
  for (const item of items) {
    const itemPath = path.join(dirPath, item)
    const itemRelPath = relativePath ? path.posix.join(relativePath, item) : item
    try {
      const stats = await fs.stat(itemPath)
      if (stats.isDirectory()) {
        const children = await readDirectoryTree(itemPath, itemRelPath)
        nodes.push({ name: item, path: itemRelPath, type: 'directory', children })
      } else {
        nodes.push({ name: item, path: itemRelPath, type: 'file', size: stats.size })
      }
    } catch (e) {
      console.error(`Error reading ${itemPath}:`, e)
    }
  }
  return nodes
}

export async function applyPatch(
  extractedDir: string,
  movedPaths: Array<{ from: string; to: string }>,
  deletedPaths: string[],
  changedFiles: Array<{ path: string; content: string }>
): Promise<void> {
  // 1. Apply renames/moves first
  for (const { from, to } of movedPaths) {
    const fromFull = path.join(extractedDir, from)
    const toFull = path.join(extractedDir, to)
    if (await fs.pathExists(fromFull)) {
      await fs.ensureDir(path.dirname(toFull))
      await fs.move(fromFull, toFull, { overwrite: true })
    }
  }

  // 2. Delete paths
  for (const p of deletedPaths) {
    const fullPath = path.join(extractedDir, p)
    await fs.remove(fullPath)
  }

  // 3. Write changed/added files
  for (const f of changedFiles) {
    const fullPath = path.join(extractedDir, f.path)
    await fs.ensureDir(path.dirname(fullPath))
    await fs.writeFile(fullPath, f.content, 'utf8')
  }
}
