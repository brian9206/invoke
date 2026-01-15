const Minio = require('minio');
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

/**
 * MinIO client for package storage
 */
class MinIOService {
  constructor() {
    this.client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'invoke-minio',
      secretKey: process.env.MINIO_SECRET_KEY || 'invoke-minio-password-123'
    })
    
    this.bucketName = process.env.MINIO_BUCKET || 'invoke-packages'
    this.initialized = false
  }

  /**
   * Initialize MinIO bucket if it doesn't exist
   */
  async initialize() {
    if (this.initialized) return

    try {
      const exists = await this.client.bucketExists(this.bucketName)
      if (!exists) {
        await this.client.makeBucket(this.bucketName, 'us-east-1')
        console.log(`✅ Created MinIO bucket: ${this.bucketName}`)
      }
      this.initialized = true
    } catch (error) {
      console.error('❌ Failed to initialize MinIO:', error)
      throw error
    }
  }

  /**
   * Compute SHA-256 hash of a file
   * @param {string} filePath - Path to the file
   * @returns {Promise<string>} SHA-256 hash
   */
  async computeFileHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(filePath)
      
      stream.on('data', (data) => hash.update(data))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  /**
   * Upload package to MinIO
   * @param {string} functionId - Function ID
   * @param {string} version - Package version
   * @param {string} filePath - Local file path
   * @param {string} contentType - MIME type
   * @returns {Promise<{hash: string, size: number}>}
   */
  async uploadPackage(functionId, version, filePath, contentType = 'application/gzip') {
    await this.initialize()
    
    const objectName = `packages/${functionId}/${version}.tgz`
    const fileStats = fs.statSync(filePath)
    const hash = await this.computeFileHash(filePath)
    
    const metaData = {
      'Content-Type': contentType,
      'X-Function-ID': functionId,
      'X-Package-Version': version,
      'X-Package-Hash': hash
    }

    try {
      await this.client.fPutObject(this.bucketName, objectName, filePath, metaData)
      console.log(`✅ Uploaded package: ${objectName}`)
      
      return {
        hash,
        size: fileStats.size,
        objectName,
        url: `${this.bucketName}/${objectName}`
      }
    } catch (error) {
      console.error(`❌ Failed to upload package ${objectName}:`, error)
      throw error
    }
  }

  /**
   * Download package from MinIO
   * @param {string} functionId - Function ID
   * @param {string} version - Package version
   * @param {string} downloadPath - Local download path
   * @returns {Promise<{hash: string, size: number}>}
   */
  async downloadPackage(functionId, version, downloadPath) {
    await this.initialize()
    
    const objectName = `packages/${functionId}/${version}.tgz`
    
    try {
      await this.client.fGetObject(this.bucketName, objectName, downloadPath)
      
      const hash = await this.computeFileHash(downloadPath)
      const stats = fs.statSync(downloadPath)
      
      return {
        hash,
        size: stats.size
      }
    } catch (error) {
      console.error(`❌ Failed to download package ${objectName}:`, error)
      throw error
    }
  }

  /**
   * Download package from specific MinIO path (for versioning system)
   * @param {string} packagePath - Full path to package in MinIO
   * @param {string} downloadPath - Local path to save the package
   * @returns {Promise<Object>} Package metadata (hash, size)
   */
  async downloadPackageFromPath(packagePath, downloadPath) {
    await this.initialize()
    
    try {
      await this.client.fGetObject(this.bucketName, packagePath, downloadPath)
      
      const hash = await this.computeFileHash(downloadPath)
      const stats = fs.statSync(downloadPath)
      
      return {
        hash,
        size: stats.size
      }
    } catch (error) {
      console.error(`❌ Failed to download package from ${packagePath}:`, error)
      throw error
    }
  }

  /**
   * Delete package from MinIO
   * @param {string} functionId - Function ID
   * @param {string} version - Package version
   */
  async deletePackage(functionId, version) {
    await this.initialize()
    
    const objectName = `packages/${functionId}/${version}.tgz`
    
    try {
      await this.client.removeObject(this.bucketName, objectName)
      console.log(`✅ Deleted package: ${objectName}`)
    } catch (error) {
      console.error(`❌ Failed to delete package ${objectName}:`, error)
      throw error
    }
  }

  /**
   * Check if package exists in MinIO
   * @param {string} functionId - Function ID
   * @param {string} version - Package version
   * @returns {Promise<boolean>}
   */
  async packageExists(functionId, version) {
    await this.initialize()
    
    const objectName = `packages/${functionId}/${version}.tgz`
    
    try {
      await this.client.statObject(this.bucketName, objectName)
      return true
    } catch (error) {
      if (error.code === 'NotFound') {
        return false
      }
      throw error
    }
  }

  /**
   * List all versions of a package
   * @param {string} functionId - Function ID
   * @returns {Promise<string[]>} Array of version numbers
   */
  async listPackageVersions(functionId) {
    await this.initialize()
    
    const prefix = `packages/${functionId}/`
    const versions = []
    
    return new Promise((resolve, reject) => {
      const stream = this.client.listObjects(this.bucketName, prefix, false)
      
      stream.on('data', (obj) => {
        const version = path.basename(obj.name, '.tgz')
        versions.push(version)
      })
      
      stream.on('end', () => resolve(versions.sort()))
      stream.on('error', reject)
    })
  }
}

module.exports = new MinIOService()