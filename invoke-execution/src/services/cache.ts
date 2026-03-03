import fs from 'fs-extra';
import path from 'path';
import { s3Service } from 'invoke-shared';

interface CacheMetadata {
  version?: string;
  hash?: string;
  size?: number;
  packagePath?: string;
  cachedAt?: string;
  lastAccessed?: string;
  lastVerified?: string;
  accessCount?: number;
}

interface CacheCheckResult {
  cached: boolean;
  valid: boolean;
  extractedPath?: string;
}

interface CacheStats {
  packageCount?: number;
  metadataCount?: number;
  totalSizeBytes?: number;
  totalSizeMB?: number;
  totalSizeGB?: number;
  maxSizeGB?: number;
  utilizationPercent?: number;
  error?: string;
}

interface CleanupResult {
  removed: number;
  freedBytes: number;
  error?: string;
}

interface LockEntry {
  promise: Promise<void>;
  resolve: () => void;
}

class CacheService {
  private cacheDir: string;
  private maxCacheSizeGB: number;
  private cacheTTLDays: number;
  private initialized: boolean;
  private cacheLocks: Map<string, LockEntry>;

  constructor() {
    this.cacheDir = path.resolve(process.env.CACHE_DIR || '/tmp/invoke-cache');
    this.maxCacheSizeGB = parseInt(process.env.MAX_CACHE_SIZE_GB ?? '10') || 10;
    this.cacheTTLDays = parseInt(process.env.CACHE_TTL_DAYS ?? '7') || 7;
    this.initialized = false;
    this.cacheLocks = new Map();

    if (!fs.pathExistsSync(this.cacheDir)) {
      fs.mkdirpSync(this.cacheDir);
      console.log(`✅ Created cache directory at: ${this.cacheDir}`);
    }
  }

  async acquireLock(functionId: string): Promise<() => void> {
    const existingLock = this.cacheLocks.get(functionId);

    if (existingLock) {
      await existingLock.promise;
      return this.acquireLock(functionId);
    }

    let releaseLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.cacheLocks.set(functionId, { promise: lockPromise, resolve: releaseLock });

    return () => {
      this.cacheLocks.delete(functionId);
      releaseLock();
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.ensureDir(this.cacheDir);
      await fs.ensureDir(path.join(this.cacheDir, 'packages'));
      await fs.ensureDir(path.join(this.cacheDir, 'metadata'));
      this.initialized = true;
      console.log(`✅ Cache service initialized at: ${this.cacheDir}`);
    } catch (error) {
      console.error('❌ Failed to initialize cache:', error);
      throw error;
    }
  }

  async getCacheMetadata(functionId: string): Promise<CacheMetadata | null> {
    await this.initialize();

    const metadataPath = path.join(this.cacheDir, 'metadata', `${functionId}.json`);

    try {
      if (await fs.pathExists(metadataPath)) {
        const metadata = await fs.readJson(metadataPath);
        return metadata as CacheMetadata;
      }
      return null;
    } catch (error) {
      console.error(`Error reading cache metadata for ${functionId}:`, error);
      return null;
    }
  }

  async saveCacheMetadata(functionId: string, metadata: CacheMetadata): Promise<void> {
    await this.initialize();

    const metadataPath = path.join(this.cacheDir, 'metadata', `${functionId}.json`);

    try {
      await fs.writeJson(metadataPath, {
        ...metadata,
        lastAccessed: new Date().toISOString(),
        lastVerified: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`Error saving cache metadata for ${functionId}:`, error);
      throw error;
    }
  }

  getCachedPackagePath(functionId: string, version: string | null = null): string {
    if (version) {
      return path.join(this.cacheDir, 'packages', `${functionId}-v${version}.tgz`);
    }
    return path.join(this.cacheDir, 'packages', `${functionId}.tgz`);
  }

  getExtractedPackagePath(functionId: string, version: string | null = null): string {
    if (version) {
      return path.join(this.cacheDir, 'packages', `${functionId}-v${version}`);
    }
    return path.join(this.cacheDir, 'packages', functionId);
  }

  async checkCache(
    functionId: string,
    expectedHash: string,
    version: string,
  ): Promise<CacheCheckResult> {
    await this.initialize();

    const cachedPath = this.getCachedPackagePath(functionId, version);
    const extractedPath = this.getExtractedPackagePath(functionId, version);
    const metadata = await this.getCacheMetadata(functionId);

    const cachedExists = await fs.pathExists(cachedPath);
    const extractedExists = await fs.pathExists(extractedPath);

    if (!cachedExists) return { cached: false, valid: false };
    if (!extractedExists) return { cached: false, valid: false };

    if (metadata && metadata.hash) {
      try {
        const actualHash = await (s3Service as any).computeFileHash(cachedPath);
        const valid = actualHash === metadata.hash;

        if (valid) {
          await this.saveCacheMetadata(functionId, {
            ...metadata,
            lastAccessed: new Date().toISOString(),
          });

          return { cached: true, valid: true, extractedPath };
        }

        console.log(
          `⚠️ Cache corruption detected for ${functionId}: file hash doesn't match metadata`,
        );
        return { cached: true, valid: false };
      } catch (error) {
        console.error(`Error verifying cache for ${functionId}:`, error);
        return { cached: true, valid: false };
      }
    }

    return { cached: true, valid: true, extractedPath };
  }

  async cachePackage(
    functionId: string,
    version: string,
    hash: string,
    size: number,
  ): Promise<string> {
    await this.initialize();

    const releaseLock = await this.acquireLock(functionId);

    try {
      const cacheCheck = await this.checkCache(functionId, hash, version);
      if (cacheCheck.cached && cacheCheck.valid) {
        console.log(`✅ Package ${functionId} already cached by another request`);
        return cacheCheck.extractedPath!;
      }

      console.log(`📦 Caching package ${functionId} version ${version}...`);

      const cachedPath = this.getCachedPackagePath(functionId, version);
      const extractedPath = this.getExtractedPackagePath(functionId, version);

      await (s3Service as any).downloadPackage(functionId, version, cachedPath);

      await fs.remove(extractedPath);
      await fs.ensureDir(extractedPath);

      const tar = require('tar');
      await tar.extract({ file: cachedPath, cwd: extractedPath });

      await this.saveCacheMetadata(functionId, {
        version,
        hash,
        size,
        cachedAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        accessCount: 1,
      });

      console.log(`✅ Package ${functionId} cached successfully`);
      return extractedPath;
    } catch (error) {
      console.error(`❌ Failed to cache package ${functionId}:`, error);
      await this.removeFromCache(functionId);
      throw error;
    } finally {
      releaseLock();
    }
  }

  async cachePackageFromPathNoLock(
    functionId: string,
    version: string,
    hash: string,
    size: number,
    packagePath: string,
  ): Promise<string> {
    await this.initialize();

    console.log(
      `📦 Caching package ${functionId} version ${version} from path ${packagePath}...`,
    );

    const cachedPath = this.getCachedPackagePath(functionId, version);
    const extractedPath = this.getExtractedPackagePath(functionId, version);

    try {
      await (s3Service as any).downloadPackageFromPath(packagePath, cachedPath);

      const actualHash = await (s3Service as any).computeFileHash(cachedPath);

      if (hash && actualHash !== hash) {
        console.log(
          `⚠️  Hash mismatch for ${functionId}: expected ${hash}, got ${actualHash}`,
        );
        console.log(`   Using actual hash ${actualHash} for cache validation`);
      }

      await fs.remove(extractedPath);
      await fs.ensureDir(extractedPath);

      const tar = require('tar');
      await tar.extract({ file: cachedPath, cwd: extractedPath });

      await this.saveCacheMetadata(functionId, {
        version,
        hash: actualHash,
        size,
        packagePath,
        cachedAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        accessCount: 1,
      });

      console.log(`✅ Package ${functionId} cached successfully from ${packagePath}`);
      return extractedPath;
    } catch (error: any) {
      console.error(
        `❌ Failed to cache package ${functionId} from path ${packagePath}:`,
        error,
      );
      await this.removeFromCache(functionId);

      if (
        error.message?.includes('Not Found') ||
        error.code === 'NotFound'
      ) {
        console.log(
          `🧹 Package ${functionId} no longer exists in storage, clearing cache`,
        );
        throw new Error('Package not found in storage (may have been deleted)');
      }

      throw error;
    }
  }

  async cachePackageFromPath(
    functionId: string,
    version: string,
    hash: string,
    size: number,
    packagePath: string,
  ): Promise<string> {
    await this.initialize();

    const releaseLock = await this.acquireLock(functionId);

    try {
      const cacheCheck = await this.checkCache(functionId, hash, version);
      if (cacheCheck.cached && cacheCheck.valid) {
        console.log(`✅ Package ${functionId} already cached by another request`);
        return cacheCheck.extractedPath!;
      }

      console.log(
        `📦 Caching package ${functionId} version ${version} from path ${packagePath}...`,
      );

      const cachedPath = this.getCachedPackagePath(functionId);
      const extractedPath = this.getExtractedPackagePath(functionId);

      await (s3Service as any).downloadPackageFromPath(packagePath, cachedPath);

      await fs.remove(extractedPath);
      await fs.ensureDir(extractedPath);

      const tar = require('tar');
      await tar.extract({ file: cachedPath, cwd: extractedPath });

      await this.saveCacheMetadata(functionId, {
        version,
        hash,
        size,
        packagePath,
        cachedAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        accessCount: 1,
      });

      console.log(`✅ Package ${functionId} cached successfully from ${packagePath}`);
      return extractedPath;
    } catch (error: any) {
      console.error(
        `❌ Failed to cache package ${functionId} from path ${packagePath}:`,
        error,
      );
      await this.removeFromCache(functionId);

      if (error.message?.includes('Not Found') || error.code === 'NotFound') {
        console.log(
          `🧹 Package ${functionId} no longer exists in storage, clearing cache`,
        );
        throw new Error('Package not found in storage (may have been deleted)');
      }

      throw error;
    } finally {
      releaseLock();
    }
  }

  async removeFromCache(functionId: string): Promise<void> {
    const cachedPath = this.getCachedPackagePath(functionId);
    const extractedPath = this.getExtractedPackagePath(functionId);
    const metadataPath = path.join(this.cacheDir, 'metadata', `${functionId}.json`);

    try {
      await Promise.all([
        fs.remove(cachedPath),
        fs.remove(extractedPath),
        fs.remove(metadataPath),
      ]);
      console.log(`🧹 Removed ${functionId} from cache`);
    } catch (error) {
      console.error(`Error removing ${functionId} from cache:`, error);
    }
  }

  async clearFunctionCache(functionId: string): Promise<void> {
    console.log(`🧹 Clearing cache for deleted function ${functionId}`);
    await this.removeFromCache(functionId);
  }

  async updateAccessStats(functionId: string): Promise<void> {
    const metadata = await this.getCacheMetadata(functionId);
    if (metadata) {
      metadata.accessCount = (metadata.accessCount || 0) + 1;
      metadata.lastAccessed = new Date().toISOString();
      await this.saveCacheMetadata(functionId, metadata);
    }
  }

  async getCacheStats(): Promise<CacheStats> {
    await this.initialize();

    const packagesDir = path.join(this.cacheDir, 'packages');
    const metadataDir = path.join(this.cacheDir, 'metadata');

    try {
      const packageFiles = await fs.readdir(packagesDir);
      let totalSize = 0;
      let packageCount = 0;

      for (const file of packageFiles) {
        if (file.endsWith('.tgz')) {
          const filePath = path.join(packagesDir, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
          packageCount++;
        }
      }

      const metadataFiles = await fs.readdir(metadataDir);
      const metadataCount = metadataFiles.filter((f) => f.endsWith('.json')).length;

      return {
        packageCount,
        metadataCount,
        totalSizeBytes: totalSize,
        totalSizeMB: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
        totalSizeGB: Math.round((totalSize / (1024 * 1024 * 1024)) * 100) / 100,
        maxSizeGB: this.maxCacheSizeGB,
        utilizationPercent: Math.round(
          (totalSize / (this.maxCacheSizeGB * 1024 * 1024 * 1024)) * 100,
        ),
      };
    } catch (error: any) {
      console.error('Error getting cache stats:', error);
      return { error: error.message };
    }
  }

  /** Alias used by routes */
  async cleanupCache(): Promise<CleanupResult> {
    return this.cleanup();
  }

  async cleanup(): Promise<CleanupResult> {
    await this.initialize();

    const metadataDir = path.join(this.cacheDir, 'metadata');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.cacheTTLDays);

    let removed = 0;
    let freedBytes = 0;

    try {
      const metadataFiles = await fs.readdir(metadataDir);

      for (const file of metadataFiles) {
        if (file.endsWith('.json')) {
          const functionId = path.basename(file, '.json');
          const metadata = await this.getCacheMetadata(functionId);

          if (metadata && metadata.lastAccessed) {
            const lastAccessed = new Date(metadata.lastAccessed);

            if (lastAccessed < cutoffDate) {
              const cachedPath = this.getCachedPackagePath(functionId);

              try {
                const stats = await fs.stat(cachedPath);
                freedBytes += stats.size;
              } catch {
                // File might not exist
              }

              await this.removeFromCache(functionId);
              removed++;
              console.log(`🧹 Cleaned up unused package: ${functionId}`);
            }
          }
        }
      }

      const stats = await this.getCacheStats();
      if ((stats.totalSizeBytes ?? 0) > this.maxCacheSizeGB * 1024 * 1024 * 1024) {
        const cleanupResult = await this.evictLeastRecentlyUsed();
        removed += cleanupResult.removed;
        freedBytes += cleanupResult.freedBytes;
      }

      console.log(
        `🧹 Cache cleanup completed: ${removed} packages removed, ${Math.round(freedBytes / 1024 / 1024)} MB freed`,
      );

      return { removed, freedBytes };
    } catch (error: any) {
      console.error('Error during cache cleanup:', error);
      return { removed, freedBytes, error: error.message };
    }
  }

  async evictLeastRecentlyUsed(): Promise<CleanupResult> {
    const metadataDir = path.join(this.cacheDir, 'metadata');
    let removed = 0;
    let freedBytes = 0;

    try {
      const metadataFiles = await fs.readdir(metadataDir);
      const packages: { functionId: string; lastAccessed: Date; size: number }[] = [];

      for (const file of metadataFiles) {
        if (file.endsWith('.json')) {
          const functionId = path.basename(file, '.json');
          const metadata = await this.getCacheMetadata(functionId);

          if (metadata && metadata.lastAccessed) {
            packages.push({
              functionId,
              lastAccessed: new Date(metadata.lastAccessed),
              size: metadata.size || 0,
            });
          }
        }
      }

      packages.sort((a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime());

      const maxSize = this.maxCacheSizeGB * 1024 * 1024 * 1024;
      let currentStats = await this.getCacheStats();

      for (const pkg of packages) {
        if ((currentStats.totalSizeBytes ?? 0) <= maxSize) break;

        await this.removeFromCache(pkg.functionId);
        removed++;
        freedBytes += pkg.size;
        (currentStats as any).totalSizeBytes =
          (currentStats.totalSizeBytes ?? 0) - pkg.size;

        console.log(`🧹 Evicted LRU package: ${pkg.functionId}`);
      }
    } catch (error) {
      console.error('Error during LRU eviction:', error);
    }

    return { removed, freedBytes };
  }
}

export default new CacheService();
