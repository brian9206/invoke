const fs = require('fs-extra')
const path = require('path')
const crypto = require('crypto')
const minioService = require('./minio')

/**
 * Cache management service for function packages
 */
class CacheService {
  constructor() {
    this.cacheDir = path.resolve(process.env.CACHE_DIR || '/tmp/invoke-cache')
    this.maxCacheSizeGB = parseInt(process.env.MAX_CACHE_SIZE_GB) || 10
    this.cacheTTLDays = parseInt(process.env.CACHE_TTL_DAYS) || 7
    this.initialized = false

    if (!fs.pathExistsSync(this.cacheDir)) {
      fs.mkdirpSync(this.cacheDir)
      console.log(`✅ Created cache directory at: ${this.cacheDir}`)
    }
  }

  /**
   * Initialize cache directory
   */
  async initialize() {
    if (this.initialized) return

    try {
      await fs.ensureDir(this.cacheDir)
      await fs.ensureDir(path.join(this.cacheDir, 'packages'))
      await fs.ensureDir(path.join(this.cacheDir, 'metadata'))
      this.initialized = true
      console.log(`✅ Cache service initialized at: ${this.cacheDir}`)
    } catch (error) {
      console.error('❌ Failed to initialize cache:', error)
      throw error
    }
  }

  /**
   * Get cache metadata for a function
   * @param {string} functionId - Function ID
   * @returns {Promise<Object|null>} Cache metadata or null
   */
  async getCacheMetadata(functionId) {
    await this.initialize()
    
    const metadataPath = path.join(this.cacheDir, 'metadata', `${functionId}.json`)
    
    try {
      if (await fs.pathExists(metadataPath)) {
        const metadata = await fs.readJson(metadataPath)
        return metadata
      }
      return null
    } catch (error) {
      console.error(`Error reading cache metadata for ${functionId}:`, error)
      return null
    }
  }

  /**
   * Save cache metadata for a function
   * @param {string} functionId - Function ID
   * @param {Object} metadata - Cache metadata
   */
  async saveCacheMetadata(functionId, metadata) {
    await this.initialize()
    
    const metadataPath = path.join(this.cacheDir, 'metadata', `${functionId}.json`)
    
    try {
      await fs.writeJson(metadataPath, {
        ...metadata,
        lastAccessed: new Date().toISOString(),
        lastVerified: new Date().toISOString()
      })
    } catch (error) {
      console.error(`Error saving cache metadata for ${functionId}:`, error)
      throw error
    }
  }

  /**
   * Get cached package path
   * @param {string} functionId - Function ID
   * @returns {string} Path to cached package
   */
  getCachedPackagePath(functionId) {
    return path.join(this.cacheDir, 'packages', `${functionId}.tgz`)
  }

  /**
   * Get extracted package path
   * @param {string} functionId - Function ID
   * @returns {string} Path to extracted package
   */
  getExtractedPackagePath(functionId) {
    return path.join(this.cacheDir, 'packages', functionId)
  }

  /**
   * Check if package is cached and verify integrity
   * @param {string} functionId - Function ID
   * @param {string} expectedHash - Expected SHA-256 hash
   * @param {string} version - Package version
   * @returns {Promise<{cached: boolean, valid: boolean, extractedPath?: string}>}
   */
  async checkCache(functionId, expectedHash, version) {
    await this.initialize()
    
    const cachedPath = this.getCachedPackagePath(functionId)
    const extractedPath = this.getExtractedPackagePath(functionId)
    const metadata = await this.getCacheMetadata(functionId)
    
    const cachedExists = await fs.pathExists(cachedPath)
    const extractedExists = await fs.pathExists(extractedPath)
    
    // Check if package is cached
    if (!cachedExists) {
      return { cached: false, valid: false }
    }

    // Check if extracted directory exists
    if (!extractedExists) {
      return { cached: false, valid: false }
    }

    // Verify hash if expectedHash is provided
    if (expectedHash) {
      try {
        const actualHash = await minioService.computeFileHash(cachedPath)
        const valid = actualHash === expectedHash
        
        if (valid && metadata) {
          // Update last accessed time
          await this.saveCacheMetadata(functionId, {
            ...metadata,
            lastAccessed: new Date().toISOString()
          })
          
          return { cached: true, valid: true, extractedPath }
        }
        
        // Hash mismatch - remove invalid cache
        if (!valid) {
          console.log(`🧹 Hash mismatch for ${functionId}, cleaning cache...`)
          await this.removeFromCache(functionId)
        }
        
        return { cached: true, valid, extractedPath: valid ? extractedPath : undefined }
      } catch (error) {
        console.error(`Error verifying cache for ${functionId}:`, error)
        return { cached: true, valid: false }
      }
    } else {
      // No hash provided, assume valid if files exist
      return { cached: true, valid: true, extractedPath }
    }
  }

  /**
   * Cache a package from MinIO
   * @param {string} functionId - Function ID
   * @param {string} version - Package version
   * @param {string} hash - Package hash
   * @param {number} size - Package size in bytes
   * @returns {Promise<string>} Path to extracted package
   */
  async cachePackage(functionId, version, hash, size) {
    await this.initialize()
    
    console.log(`📦 Caching package ${functionId} version ${version}...`)
    
    const cachedPath = this.getCachedPackagePath(functionId)
    const extractedPath = this.getExtractedPackagePath(functionId)
    
    try {
      // Download from MinIO
      await minioService.downloadPackage(functionId, version, cachedPath)
      
      // Extract package
      await fs.remove(extractedPath) // Remove existing if any
      await fs.ensureDir(extractedPath)
      
      const tar = require('tar')
      await tar.extract({
        file: cachedPath,
        cwd: extractedPath
      })
      
      // Save metadata
      await this.saveCacheMetadata(functionId, {
        version,
        hash,
        size,
        cachedAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        accessCount: 1
      })
      
      console.log(`✅ Package ${functionId} cached successfully`)
      return extractedPath
    } catch (error) {
      console.error(`❌ Failed to cache package ${functionId}:`, error)
      // Clean up on failure
      await this.removeFromCache(functionId)
      throw error
    }
  }

  /**
   * Cache package from specific MinIO path (for versioning system)
   * @param {string} functionId - Function ID
   * @param {string} version - Package version
   * @param {string} hash - Package hash
   * @param {number} size - Package size
   * @param {string} packagePath - MinIO path to package
   * @returns {Promise<string>} Path to extracted package
   */
  async cachePackageFromPath(functionId, version, hash, size, packagePath) {
    await this.initialize()
    
    console.log(`📦 Caching package ${functionId} version ${version} from path ${packagePath}...`)
    
    const cachedPath = this.getCachedPackagePath(functionId)
    const extractedPath = this.getExtractedPackagePath(functionId)
    
    try {
      // Download from MinIO using specific path
      await minioService.downloadPackageFromPath(packagePath, cachedPath)
      
      // Extract package
      await fs.remove(extractedPath) // Remove existing if any
      await fs.ensureDir(extractedPath)
      
      const tar = require('tar')
      await tar.extract({
        file: cachedPath,
        cwd: extractedPath
      })
      
      // Save metadata
      await this.saveCacheMetadata(functionId, {
        version,
        hash,
        size,
        packagePath,
        cachedAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        accessCount: 1
      })
      
      console.log(`✅ Package ${functionId} cached successfully from ${packagePath}`)
      return extractedPath
    } catch (error) {
      console.error(`❌ Failed to cache package ${functionId} from path ${packagePath}:`, error)
      // Clean up on failure
      await this.removeFromCache(functionId)
      
      // If the error is "Not Found", it likely means the package was deleted
      if (error.message.includes('Not Found') || error.code === 'NotFound') {
        console.log(`🧹 Package ${functionId} no longer exists in storage, clearing cache`)
        throw new Error('Package not found in storage (may have been deleted)')
      }
      
      throw error
    }
  }

  /**
   * Remove package from cache
   * @param {string} functionId - Function ID
   */
  async removeFromCache(functionId) {
    const cachedPath = this.getCachedPackagePath(functionId)
    const extractedPath = this.getExtractedPackagePath(functionId)
    const metadataPath = path.join(this.cacheDir, 'metadata', `${functionId}.json`)
    
    try {
      await Promise.all([
        fs.remove(cachedPath),
        fs.remove(extractedPath),
        fs.remove(metadataPath)
      ])
      console.log(`🧹 Removed ${functionId} from cache`)
    } catch (error) {
      console.error(`Error removing ${functionId} from cache:`, error)
    }
  }

  /**
   * Clear cache for a specific function (called when function/version is deleted)
   * @param {string} functionId - Function ID
   */
  async clearFunctionCache(functionId) {
    console.log(`🧹 Clearing cache for deleted function ${functionId}`)
    await this.removeFromCache(functionId)
  }

  /**
   * Update access statistics for a cached package
   * @param {string} functionId - Function ID
   */
  async updateAccessStats(functionId) {
    const metadata = await this.getCacheMetadata(functionId)
    if (metadata) {
      metadata.accessCount = (metadata.accessCount || 0) + 1
      metadata.lastAccessed = new Date().toISOString()
      await this.saveCacheMetadata(functionId, metadata)
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} Cache statistics
   */
  async getCacheStats() {
    await this.initialize()
    
    const packagesDir = path.join(this.cacheDir, 'packages')
    const metadataDir = path.join(this.cacheDir, 'metadata')
    
    try {
      // Get directory size
      const packageFiles = await fs.readdir(packagesDir)
      let totalSize = 0
      let packageCount = 0
      
      for (const file of packageFiles) {
        if (file.endsWith('.tgz')) {
          const filePath = path.join(packagesDir, file)
          const stats = await fs.stat(filePath)
          totalSize += stats.size
          packageCount++
        }
      }
      
      // Get metadata count
      const metadataFiles = await fs.readdir(metadataDir)
      const metadataCount = metadataFiles.filter(f => f.endsWith('.json')).length
      
      return {
        packageCount,
        metadataCount,
        totalSizeBytes: totalSize,
        totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100,
        totalSizeGB: Math.round(totalSize / (1024 * 1024 * 1024) * 100) / 100,
        maxSizeGB: this.maxCacheSizeGB,
        utilizationPercent: Math.round((totalSize / (this.maxCacheSizeGB * 1024 * 1024 * 1024)) * 100)
      }
    } catch (error) {
      console.error('Error getting cache stats:', error)
      return { error: error.message }
    }
  }

  /**
   * Clean up old and unused packages
   * @returns {Promise<{removed: number, freedBytes: number}>}
   */
  async cleanup() {
    await this.initialize()
    
    const metadataDir = path.join(this.cacheDir, 'metadata')
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.cacheTTLDays)
    
    let removed = 0
    let freedBytes = 0
    
    try {
      const metadataFiles = await fs.readdir(metadataDir)
      
      for (const file of metadataFiles) {
        if (file.endsWith('.json')) {
          const functionId = path.basename(file, '.json')
          const metadata = await this.getCacheMetadata(functionId)
          
          if (metadata && metadata.lastAccessed) {
            const lastAccessed = new Date(metadata.lastAccessed)
            
            // Remove if not accessed within TTL
            if (lastAccessed < cutoffDate) {
              const cachedPath = this.getCachedPackagePath(functionId)
              
              // Get size before removal
              try {
                const stats = await fs.stat(cachedPath)
                freedBytes += stats.size
              } catch (e) {
                // File might not exist
              }
              
              await this.removeFromCache(functionId)
              removed++
              console.log(`🧹 Cleaned up unused package: ${functionId}`)
            }
          }
        }
      }
      
      // Check if cache size exceeds limit and remove least recently used
      const stats = await this.getCacheStats()
      if (stats.totalSizeBytes > this.maxCacheSizeGB * 1024 * 1024 * 1024) {
        const cleanupResult = await this.evictLeastRecentlyUsed()
        removed += cleanupResult.removed
        freedBytes += cleanupResult.freedBytes
      }
      
      console.log(`🧹 Cache cleanup completed: ${removed} packages removed, ${Math.round(freedBytes / 1024 / 1024)} MB freed`)
      
      return { removed, freedBytes }
    } catch (error) {
      console.error('Error during cache cleanup:', error)
      return { removed, freedBytes, error: error.message }
    }
  }

  /**
   * Evict least recently used packages to free space
   * @returns {Promise<{removed: number, freedBytes: number}>}
   */
  async evictLeastRecentlyUsed() {
    const metadataDir = path.join(this.cacheDir, 'metadata')
    let removed = 0
    let freedBytes = 0
    
    try {
      const metadataFiles = await fs.readdir(metadataDir)
      const packages = []
      
      // Collect all packages with their last accessed time
      for (const file of metadataFiles) {
        if (file.endsWith('.json')) {
          const functionId = path.basename(file, '.json')
          const metadata = await this.getCacheMetadata(functionId)
          
          if (metadata && metadata.lastAccessed) {
            packages.push({
              functionId,
              lastAccessed: new Date(metadata.lastAccessed),
              size: metadata.size || 0
            })
          }
        }
      }
      
      // Sort by last accessed (oldest first)
      packages.sort((a, b) => a.lastAccessed - b.lastAccessed)
      
      // Remove oldest packages until under limit
      const maxSize = this.maxCacheSizeGB * 1024 * 1024 * 1024
      let currentStats = await this.getCacheStats()
      
      for (const pkg of packages) {
        if (currentStats.totalSizeBytes <= maxSize) break
        
        await this.removeFromCache(pkg.functionId)
        removed++
        freedBytes += pkg.size
        currentStats.totalSizeBytes -= pkg.size
        
        console.log(`🧹 Evicted LRU package: ${pkg.functionId}`)
      }
      
    } catch (error) {
      console.error('Error during LRU eviction:', error)
    }
    
    return { removed, freedBytes }
  }
}

module.exports = new CacheService()