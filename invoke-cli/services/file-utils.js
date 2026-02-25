const fs = require('fs');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const ignore = require('ignore');

/**
 * Prepare a file or directory for upload
 * If it's a directory, create a temporary zip file
 * @param {string} filePath - Path to file or directory
 * @returns {Promise<{filePath: string, cleanup: function|null}>}
 */
async function prepareUpload(filePath) {
  const stats = fs.statSync(filePath);
  
  if (stats.isFile()) {
    // It's already a file (presumably a zip)
    return {
      filePath: filePath,
      cleanup: null
    };
  }
  
  if (stats.isDirectory()) {
    // Create a temporary zip file
    const tempDir = os.tmpdir();
    const tempZipPath = path.join(tempDir, `invoke-upload-${Date.now()}.zip`);
    
    await createZipFromDirectory(filePath, tempZipPath);
    
    return {
      filePath: tempZipPath,
      cleanup: () => cleanupTempFile(tempZipPath)
    };
  }
  
  throw new Error(`Path is neither a file nor a directory: ${filePath}`);
}

/**
 * Create a zip file from a directory
 * @param {string} sourceDir - Source directory path
 * @param {string} outputPath - Output zip file path
 * @returns {Promise<void>}
 */
function createZipFromDirectory(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    output.on('close', () => {
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Check for .invokeignore and filter files accordingly
    const ignorePath = path.join(sourceDir, '.invokeignore');
    if (fs.existsSync(ignorePath)) {
      const patterns = fs.readFileSync(ignorePath, 'utf8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
      const ig = ignore().add(patterns);
      const allFiles = walkDir(sourceDir, sourceDir);
      const kept = ig.filter(allFiles);
      for (const relFile of kept) {
        if (relFile === '.invokeignore') continue;
        archive.file(path.join(sourceDir, relFile), { name: relFile });
      }
    } else {
      // No ignore file — include everything
      archive.directory(sourceDir, false);
    }
    
    archive.finalize();
  });
}

/**
 * Recursively collect relative file paths under a directory
 * @param {string} dir - Current directory being walked
 * @param {string} baseDir - Root directory (for computing relative paths)
 * @returns {string[]}
 */
function walkDir(dir, baseDir) {
  const results = [];
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...walkDir(fullPath, baseDir));
    } else {
      results.push(relPath);
    }
  }
  return results;
}

/**
 * Handle download based on output path
 * If output ends with .zip, save as zip
 * Otherwise, extract to directory
 * @param {string} zipPath - Path to downloaded zip file
 * @param {string} outputPath - Desired output path
 * @returns {Promise<{path: string, type: 'zip'|'directory'}>}
 */
async function handleDownload(zipPath, outputPath) {
  if (outputPath.endsWith('.zip')) {
    // User wants the zip file
    if (zipPath !== outputPath) {
      fs.copyFileSync(zipPath, outputPath);
      fs.unlinkSync(zipPath);
    }
    return {
      path: outputPath,
      type: 'zip'
    };
  } else {
    // User wants it extracted to a directory
    await extractZipToDirectory(zipPath, outputPath);
    fs.unlinkSync(zipPath);
    return {
      path: outputPath,
      type: 'directory'
    };
  }
}

/**
 * Extract a zip file to a directory
 * @param {string} zipPath - Path to zip file
 * @param {string} outputDir - Output directory path
 * @returns {Promise<void>}
 */
async function extractZipToDirectory(zipPath, outputDir) {
  try {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(outputDir, true);
  } catch (error) {
    throw new Error(`Failed to extract zip: ${error.message}`);
  }
}

/**
 * Clean up a temporary file
 * @param {string} filePath - Path to file to delete
 */
function cleanupTempFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`Warning: Failed to cleanup temp file ${filePath}:`, error.message);
  }
}

/**
 * Check if a path exists
 * @param {string} filePath - Path to check
 * @returns {boolean}
 */
function pathExists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * Get file stats
 * @param {string} filePath - Path to file
 * @returns {fs.Stats}
 */
function getStats(filePath) {
  return fs.statSync(filePath);
}

module.exports = {
  prepareUpload,
  createZipFromDirectory,
  handleDownload,
  extractZipToDirectory,
  cleanupTempFile,
  pathExists,
  getStats
};
