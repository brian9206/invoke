import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import ignore from 'ignore';
import os from 'os';

/**
 * Prepare a file or directory for upload
 * Returns the path to the (possibly zipped) file for upload
 */
async function prepareUpload(inputPath: string): Promise<{ filePath: string; cleanup: () => void }> {
  const stats = fs.statSync(inputPath);

  if (stats.isDirectory()) {
    const zipPath = path.join(os.tmpdir(), `invoke-upload-${Date.now()}.zip`);
    await createZipFromDirectory(inputPath, zipPath);

    return {
      filePath: zipPath,
      cleanup: () => {
        try {
          fs.unlinkSync(zipPath);
        } catch {
          // ignore
        }
      },
    };
  }

  return {
    filePath: inputPath,
    cleanup: () => {},
  };
}

/**
 * Create a zip archive from a directory
 */
async function createZipFromDirectory(dirPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);

    // Check for .invokeignore file
    const ignorePath = path.join(dirPath, '.invokeignore');
    const ig = ignore();

    if (fs.existsSync(ignorePath)) {
      const ignoreContent = fs.readFileSync(ignorePath, 'utf8');
      ig.add(ignoreContent.split('\n').filter(Boolean));
    }

    // Always ignore common build artifacts and version control directories
    ig.add([
      'node_modules/**',
      '.git/**',
      '*.zip',
      '.DS_Store',
      'Thumbs.db',
    ]);

    const files = walkDir(dirPath);

    for (const filePath of files) {
      const relativePath = path.relative(dirPath, filePath);

      if (!ig.ignores(relativePath)) {
        archive.file(filePath, { name: relativePath });
      }
    }

    archive.finalize();
  });
}

/**
 * Walk a directory and return all file paths
 */
function walkDir(dirPath: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Handle downloading a file from the API
 */
async function handleDownload(data: Buffer | ArrayBuffer, outputPath: string): Promise<void> {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  fs.writeFileSync(outputPath, buffer);
}

/**
 * Extract a zip file to a directory
 */
async function extractZipToDirectory(zipPath: string, outputDir: string): Promise<void> {
  const zip = new AdmZip(zipPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  zip.extractAllTo(outputDir, true);
}

/**
 * Clean up a temp file
 */
function cleanupTempFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // ignore
  }
}

/**
 * Check if a path exists
 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get stats for a path
 */
async function getStats(p: string): Promise<fs.Stats | null> {
  try {
    return await fs.promises.stat(p);
  } catch {
    return null;
  }
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export {
  prepareUpload,
  createZipFromDirectory,
  walkDir,
  handleDownload,
  extractZipToDirectory,
  cleanupTempFile,
  pathExists,
  getStats,
  formatFileSize,
};
