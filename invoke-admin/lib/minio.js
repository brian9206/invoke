const Minio = require('minio');
const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');

/**
 * MinIO Service for Invoke Platform
 * Handles object storage operations for function packages
 */
class MinIOService {
    constructor() {
        this.client = new Minio.Client({
            endPoint: process.env.MINIO_ENDPOINT || 'localhost',
            port: parseInt(process.env.MINIO_PORT || '9000'),
            useSSL: process.env.MINIO_USE_SSL === 'true',
            accessKey: process.env.MINIO_ACCESS_KEY || 'invoke-minio',
            secretKey: process.env.MINIO_SECRET_KEY || 'invoke-minio-password-123'
        });
        
        this.bucketName = process.env.MINIO_BUCKET || 'invoke-packages';
        this.initialized = false;
    }

    /**
     * Initialize MinIO service and create bucket if not exists
     */
    async initialize() {
        try {
            const exists = await this.client.bucketExists(this.bucketName);
            if (!exists) {
                await this.client.makeBucket(this.bucketName, 'us-east-1');
                console.log(`✓ Created MinIO bucket: ${this.bucketName}`);
            } else {
                console.log(`✓ MinIO bucket exists: ${this.bucketName}`);
            }
            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize MinIO:', error);
            throw error;
        }
    }

    /**
     * Get MinIO client instance
     */
    getClient() {
        return this.client;
    }

    /**
     * Compute SHA-256 hash of a file
     */
    async computeFileHash(filePath) {
        const fileBuffer = await fs.readFile(filePath);
        return crypto.createHash('sha256').update(fileBuffer).digest('hex');
    }

    /**
     * Upload a package to MinIO
     */
    async uploadPackage(functionId, version, filePath) {
        if (!this.initialized) {
            await this.initialize();
        }

        const objectName = `packages/${functionId}/${version}.tgz`;
        
        try {
            // Compute hash before upload
            const hash = await this.computeFileHash(filePath);
            
            // Upload the file
            const fileStats = await fs.stat(filePath);
            await this.client.fPutObject(this.bucketName, objectName, filePath, {
                'Content-Type': 'application/gzip',
                'Function-ID': functionId,
                'Package-Version': version,
                'Package-Hash': hash,
                'Upload-Time': new Date().toISOString()
            });

            console.log(`✓ Uploaded package: ${objectName} (${fileStats.size} bytes)`);
            return {
                bucket: this.bucketName,
                objectName,
                size: fileStats.size,
                hash
            };
        } catch (error) {
            console.error(`Failed to upload package ${objectName}:`, error);
            throw error;
        }
    }

    /**
     * Download a package from MinIO
     */
    async downloadPackage(functionId, version, destinationPath) {
        if (!this.initialized) {
            await this.initialize();
        }

        const objectName = `packages/${functionId}/${version}.tgz`;
        
        try {
            await this.client.fGetObject(this.bucketName, objectName, destinationPath);
            console.log(`✓ Downloaded package: ${objectName}`);
            return destinationPath;
        } catch (error) {
            console.error(`Failed to download package ${objectName}:`, error);
            throw error;
        }
    }

    /**
     * Check if a package exists
     */
    async packageExists(functionId, version) {
        if (!this.initialized) {
            await this.initialize();
        }

        const objectName = `packages/${functionId}/${version}.tgz`;
        
        try {
            await this.client.statObject(this.bucketName, objectName);
            return true;
        } catch (error) {
            if (error.code === 'NotFound') {
                return false;
            }
            throw error;
        }
    }

    /**
     * Delete a package
     */
    async deletePackage(functionId, version) {
        if (!this.initialized) {
            await this.initialize();
        }

        const objectName = `packages/${functionId}/${version}.tgz`;
        
        try {
            await this.client.removeObject(this.bucketName, objectName);
            console.log(`✓ Deleted package: ${objectName}`);
            return true;
        } catch (error) {
            console.error(`Failed to delete package ${objectName}:`, error);
            throw error;
        }
    }

    /**
     * Delete all packages for a function
     */
    async deleteAllPackagesForFunction(functionId) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const packages = await this.listFunctionPackages(functionId);
            const deletePromises = packages.map(pkg => 
                this.client.removeObject(this.bucketName, pkg.name)
            );
            
            await Promise.all(deletePromises);
            console.log(`✓ Deleted ${packages.length} packages for function ${functionId}`);
            return packages.length;
        } catch (error) {
            console.error(`Failed to delete packages for function ${functionId}:`, error);
            throw error;
        }
    }

    /**
     * List all packages for a function
     */
    async listFunctionPackages(functionId) {
        if (!this.initialized) {
            await this.initialize();
        }

        const prefix = `packages/${functionId}/`;
        const packages = [];
        
        return new Promise((resolve, reject) => {
            const objectsStream = this.client.listObjectsV2(this.bucketName, prefix);
            
            objectsStream.on('data', (obj) => {
                const version = path.basename(obj.name, '.tgz');
                packages.push({
                    version,
                    name: obj.name,
                    size: obj.size,
                    lastModified: obj.lastModified,
                    etag: obj.etag
                });
            });

            objectsStream.on('error', reject);
            objectsStream.on('end', () => resolve(packages));
        });
    }
}

// Create singleton instance
const minioService = new MinIOService();

module.exports = minioService;