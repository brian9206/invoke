'use strict'

const {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListBucketsCommand,
} = require('@aws-sdk/client-s3')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream/promises')

/**
 * S3-compatible object storage service for the Invoke platform.
 * Backed by MinIO in development; any S3-compatible provider in production.
 *
 * Configuration env vars:
 *   S3_ENDPOINT   – hostname only (default: localhost)
 *   S3_PORT       – port number   (default: 9000)
 *   S3_USE_SSL    – "true" | "false" (default: false)
 *   S3_ACCESS_KEY – access key id  (default: invoke-minio)
 *   S3_SECRET_KEY – secret access key (default: invoke-minio-password-123)
 *   S3_BUCKET     – bucket name   (default: invoke-packages)
 */
class S3Service {
  constructor() {
    /** @type {S3Client|null} */
    this.client = null
    /** @type {string} */
    this.bucketName = process.env.S3_BUCKET || 'invoke-packages'
    /** @type {boolean} */
    this.initialized = false
  }

  // ─── Internal Helpers ────────────────────────────────────────────────────────

  _buildClient() {
    const endpoint = process.env.S3_ENDPOINT || 'localhost'
    const port = parseInt(process.env.S3_PORT || '9000', 10)
    const useSSL = process.env.S3_USE_SSL === 'true'
    const accessKey = process.env.S3_ACCESS_KEY || 'invoke-minio'
    const secretKey = process.env.S3_SECRET_KEY || 'invoke-minio-password-123'
    const scheme = useSSL ? 'https' : 'http'

    const config = {
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      // Required for path-style addressing used by MinIO
      forcePathStyle: true,
    }

    if (process.env.S3_ENDPOINT) {
      config.endpoint = `${scheme}://${endpoint}:${port}`
    }

    return new S3Client(config)
  }

  _ensureClient() {
    if (!this.client) {
      this.client = this._buildClient()
    }
    return this.client
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  /**
   * Ensure the target bucket exists, creating it if necessary.
   * Idempotent — safe to call on every request.
   */
  async initialize() {
    if (this.initialized) return

    const client = this._ensureClient()
    this.bucketName = process.env.S3_BUCKET || 'invoke-packages'

    try {
      await client.send(new HeadBucketCommand({ Bucket: this.bucketName }))
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        await client.send(new CreateBucketCommand({ Bucket: this.bucketName }))
        console.log(`✅ Created S3 bucket: ${this.bucketName}`)
      } else {
        console.error('❌ Failed to initialize S3 service:', error)
        throw error
      }
    }

    this.initialized = true
  }

  // ─── Low-level S3 Operations ──────────────────────────────────────────────────

  /**
   * Returns the raw S3Client for advanced usage.
   * @returns {S3Client}
   */
  getClient() {
    return this._ensureClient()
  }

  /**
   * List all buckets.
   * @returns {Promise<Array<{Name:string,CreationDate:Date}>>}
   */
  async listBuckets() {
    const response = await this._ensureClient().send(new ListBucketsCommand({}))
    return response.Buckets || []
  }

  /**
   * Upload a local file to S3 (analogous to Minio fPutObject).
   * @param {string} bucket
   * @param {string} key
   * @param {string} filePath  – local filesystem path
   * @param {Record<string,string>} [metadata] – additional metadata headers
   */
  async fPutObject(bucket, key, filePath, metadata = {}) {
    const client = this._ensureClient()
    const { 'Content-Type': contentType = 'application/octet-stream', ...rest } = metadata

    const fileStream = fs.createReadStream(filePath)
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileStream,
      ContentType: contentType,
      Metadata: Object.fromEntries(
        Object.entries(rest).map(([k, v]) => [k.toLowerCase(), String(v)])
      ),
    }))
  }

  /**
   * Download an S3 object to a local file (analogous to Minio fGetObject).
   * @param {string} bucket
   * @param {string} key
   * @param {string} downloadPath  – local filesystem path to write to
   */
  async fGetObject(bucket, key, downloadPath) {
    const client = this._ensureClient()
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    const writeStream = fs.createWriteStream(downloadPath)
    await pipeline(response.Body, writeStream)
  }

  /**
   * Get an S3 object as a Node.js Readable stream (analogous to Minio getObject).
   * @param {string} bucket
   * @param {string} key
   * @returns {Promise<import('stream').Readable>}
   */
  async getObjectStream(bucket, key) {
    const client = this._ensureClient()
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    return response.Body
  }

  /**
   * Get object metadata (analogous to Minio statObject).
   * @param {string} bucket
   * @param {string} key
   */
  async statObject(bucket, key) {
    const client = this._ensureClient()
    return client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
  }

  /**
   * Delete an object (analogous to Minio removeObject).
   * @param {string} bucket
   * @param {string} key
   */
  async removeObject(bucket, key) {
    const client = this._ensureClient()
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  }

  // ─── Package-Level Operations ─────────────────────────────────────────────────

  /**
   * Compute SHA-256 hash of a file using a read stream.
   * @param {string} filePath
   * @returns {Promise<string>} hex digest
   */
  async computeFileHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(filePath)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  /**
   * Upload a package archive to the configured bucket.
   * @param {string} functionId
   * @param {string|number} version
   * @param {string} filePath  – local path to the .tgz archive
   * @param {string} [contentType]
   * @returns {Promise<{bucket:string, objectName:string, size:number, hash:string, url:string}>}
   */
  async uploadPackage(functionId, version, filePath, contentType = 'application/gzip') {
    await this.initialize()

    const objectName = `packages/${functionId}/${version}.tgz`
    const fileStats = fs.statSync(filePath)
    const hash = await this.computeFileHash(filePath)

    await this.fPutObject(this.bucketName, objectName, filePath, {
      'Content-Type': contentType,
      'x-function-id': functionId,
      'x-package-version': String(version),
      'x-package-hash': hash,
      'upload-time': new Date().toISOString(),
    })

    console.log(`✅ Uploaded package: ${objectName}`)
    return {
      bucket: this.bucketName,
      objectName,
      size: fileStats.size,
      hash,
      url: `${this.bucketName}/${objectName}`,
    }
  }

  /**
   * Download a package archive from S3 by function ID and version.
   * @param {string} functionId
   * @param {string|number} version
   * @param {string} downloadPath  – local path to write the archive
   * @returns {Promise<{hash:string, size:number}>}
   */
  async downloadPackage(functionId, version, downloadPath) {
    await this.initialize()

    const objectName = `packages/${functionId}/${version}.tgz`
    await this.fGetObject(this.bucketName, objectName, downloadPath)

    const hash = await this.computeFileHash(downloadPath)
    const stats = fs.statSync(downloadPath)
    return { hash, size: stats.size }
  }

  /**
   * Download a package from an arbitrary S3 key path (used by versioning system).
   * @param {string} packagePath  – S3 key
   * @param {string} downloadPath – local path to write the archive
   * @returns {Promise<{hash:string, size:number}>}
   */
  async downloadPackageFromPath(packagePath, downloadPath) {
    await this.initialize()

    await this.fGetObject(this.bucketName, packagePath, downloadPath)

    const hash = await this.computeFileHash(downloadPath)
    const stats = fs.statSync(downloadPath)
    return { hash, size: stats.size }
  }

  /**
   * Delete a specific package version.
   * @param {string} functionId
   * @param {string|number} version
   */
  async deletePackage(functionId, version) {
    await this.initialize()

    const objectName = `packages/${functionId}/${version}.tgz`
    await this.removeObject(this.bucketName, objectName)
    console.log(`✅ Deleted package: ${objectName}`)
  }

  /**
   * Delete all stored packages for a function.
   * @param {string} functionId
   * @returns {Promise<number>} count of deleted objects
   */
  async deleteAllPackagesForFunction(functionId) {
    await this.initialize()

    const packages = await this.listFunctionPackages(functionId)
    await Promise.all(packages.map((pkg) => this.removeObject(this.bucketName, pkg.name)))
    console.log(`✅ Deleted ${packages.length} packages for function ${functionId}`)
    return packages.length
  }

  /**
   * Check whether a specific package version exists in S3.
   * @param {string} functionId
   * @param {string|number} version
   * @returns {Promise<boolean>}
   */
  async packageExists(functionId, version) {
    await this.initialize()

    const objectName = `packages/${functionId}/${version}.tgz`
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucketName, Key: objectName }))
      return true
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false
      }
      throw error
    }
  }

  /**
   * List all version strings for a function's packages.
   * @param {string} functionId
   * @returns {Promise<string[]>} sorted version strings
   */
  async listPackageVersions(functionId) {
    const packages = await this.listFunctionPackages(functionId)
    return packages.map((pkg) => pkg.version).sort()
  }

  /**
   * List all package objects for a function with full metadata.
   * Handles S3 pagination automatically.
   * @param {string} functionId
   * @returns {Promise<Array<{version:string, name:string, size:number, lastModified:Date, etag:string}>>}
   */
  async listFunctionPackages(functionId) {
    await this.initialize()

    const client = this._ensureClient()
    const prefix = `packages/${functionId}/`
    const packages = []
    let continuationToken

    do {
      const response = await client.send(new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }))

      for (const obj of response.Contents || []) {
        packages.push({
          version: path.basename(obj.Key, '.tgz'),
          name: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified,
          etag: obj.ETag,
        })
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
    } while (continuationToken)

    return packages
  }
}

module.exports = new S3Service()
