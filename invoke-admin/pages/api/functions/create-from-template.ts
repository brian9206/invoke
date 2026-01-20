export const runtime = 'nodejs';

import { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs-extra'
import path from 'path'
import tar from 'tar'
import { v4 as uuidv4 } from 'uuid'
import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')
const minioService = require('@/lib/minio')

// Hello World function template
const helloWorldTemplate = `module.exports = async (req, res) => {
  console.log('Hello World function called');
  
  try {
    // Handle different request methods
    const inputData = req.method === 'GET' ? req.query : req.body;
    
    const response = {
      success: true,
      message: \`Hello, \${inputData.name || 'World'}!\`,
      timestamp: new Date().toISOString(),
      method: req.method,
      data: inputData
    };
    
    console.log('Response:', response);
    res.json(response);
    
  } catch (error) {
    console.error('Error in Hello World function:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
`

const packageJsonTemplate = {
  "name": "hello-world-function",
  "version": "1.0.0",
  "description": "A simple Hello World function",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "keywords": ["hello", "world", "function", "invoke"],
  "author": "Invoke Platform",
  "license": "MIT"
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const userId = req.user!.id

  try {
    // Initialize MinIO service
    if (!minioService.initialized) {
      await minioService.initialize()
    }

    const { name, description, requiresApiKey, apiKey, projectId } = req.body

    if (!name || !name.trim()) {
      return res.status(400).json(createResponse(false, null, 'Function name is required', 400))
    }

    const functionName = name.trim()
    const functionDescription = description || 'Hello World function'

    // Check if function already exists by name
    const existingResult = await database.query(
      'SELECT id, name FROM functions WHERE name = $1',
      [functionName]
    )

    if (existingResult.rows.length > 0) {
      return res.status(409).json(createResponse(false, null, `Function with name "${functionName}" already exists`, 409))
    }

    const functionId = uuidv4()
    const version = 1

    // Get temp directory from environment or use default
    const tempBaseDir = process.env.TEMP_DIR || './.cache'
    await fs.ensureDir(tempBaseDir)

    // Create temporary directory for function files
    const tempDir = path.join(tempBaseDir, `helloworld-${functionId}`)
    await fs.ensureDir(tempDir)

    try {
      // Create function files
      await fs.writeFile(path.join(tempDir, 'index.js'), helloWorldTemplate)
      await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify(packageJsonTemplate, null, 2))
      
      // Create README
      const readmeContent = `# ${functionName}

${functionDescription}

This is a Hello World function created using the Invoke platform.

## Usage

- GET: \`/invoke/${functionId}?name=YourName\`
- POST: Send JSON with \`{"name": "YourName"}\`

## Response

Returns a JSON object with a greeting message.
`
      await fs.writeFile(path.join(tempDir, 'README.md'), readmeContent)

      // Create tar.gz archive
      const tgzPath = path.join(tempBaseDir, `${functionId}.tgz`)
      await tar.c(
        {
          gzip: true,
          file: tgzPath,
          cwd: tempDir
        },
        ['.']
      )

      // Get file stats
      const stats = await fs.stat(tgzPath)
      const fileBuffer = await fs.readFile(tgzPath)
      
      // Calculate hash
      const crypto = require('crypto')
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex')

      // Upload to MinIO
      const minioObjectName = `functions/${functionId}/v${version}.tgz`
      const bucketName = process.env.MINIO_BUCKET || 'invoke-packages'
      await minioService.client.fPutObject(bucketName, minioObjectName, tgzPath, {
        'Content-Type': 'application/gzip',
        'Function-ID': functionId,
        'Version': version.toString()
      })

      console.log(`Successfully uploaded to MinIO: ${minioObjectName}`)

      // Create function record first (without active_version_id)
      const insertResult = await database.query(
        `INSERT INTO functions (id, name, description, deployed_by, requires_api_key, api_key, is_active, project_id)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7) RETURNING *`,
        [functionId, functionName, functionDescription, userId, requiresApiKey || false, apiKey || null, projectId || null]
      )

      // Generate a separate version ID
      const versionId = require('crypto').randomUUID()

      // Create version record
      await database.query(
        `INSERT INTO function_versions (id, function_id, version, file_size, package_hash, created_by, package_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [versionId, functionId, version, stats.size, hash, userId, minioObjectName]
      )

      // Update function to set active_version_id
      await database.query(
        `UPDATE functions SET active_version_id = $1 WHERE id = $2`,
        [versionId, functionId]
      )

      // Clean up temporary files
      await fs.remove(tempDir)
      await fs.remove(tgzPath)

      console.log(`Successfully created Hello World function: ${functionName} (${functionId})`)

      return res.status(201).json(createResponse(true, {
        id: functionId,
        name: functionName,
        version: version,
        size: stats.size
      }, 'Hello World function created successfully'))

    } catch (error) {
      // Clean up on error
      try {
        await fs.remove(tempDir)
        await fs.remove(path.join(tempBaseDir, `${functionId}.tgz`))
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError)
      }
      throw error
    }

  } catch (error) {
    console.error('Error creating Hello World function:', error)
    
    return res.status(500).json(createResponse(false, null, 'Failed to create function', 500))
  }
}

export default withAuthAndMethods(['POST'])(handler)