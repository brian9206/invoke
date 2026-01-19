import { NextApiRequest, NextApiResponse } from 'next'
import multer from 'multer'
import path from 'path'
import fs from 'fs-extra'
import tar from 'tar'
import jwt from 'jsonwebtoken'

const { createResponse } = require('../../../../lib/utils')
const database = require('../../../../lib/database')
const minioService = require('../../../../lib/minio')

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.zip', '.tar.gz', '.tgz']
    const fileExt = path.extname(file.originalname).toLowerCase()
    const isValidType = allowedTypes.some(type => 
      file.originalname.toLowerCase().endsWith(type)
    )
    
    if (isValidType) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only .zip, .tar.gz, and .tgz files are allowed.'))
    }
  }
})

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
  }

  let uploadedFile: any = null

  try {
    await database.connect()

    const { id: functionId } = req.query

    if (!functionId || typeof functionId !== 'string') {
      return res.status(400).json(createResponse(false, null, 'Function ID is required', 400))
    }

    // Extract and verify JWT token
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(createResponse(false, null, 'Authorization header required', 401))
    }

    const token = authHeader.substring(7)
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
    
    let userId: string
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET)
      userId = decoded.userId
    } catch (error) {
      return res.status(401).json(createResponse(false, null, 'Invalid token', 401))
    }

    // Check if function exists
    const functionResult = await database.query(
      'SELECT * FROM functions WHERE id = $1',
      [functionId]
    )

    if (functionResult.rows.length === 0) {
      return res.status(404).json(createResponse(false, null, 'Function not found', 404))
    }

    const existingFunction = functionResult.rows[0]

    // Handle file upload
    await new Promise<void>((resolve, reject) => {
      upload.single('file')(req as any, res as any, (error: any) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })

    uploadedFile = (req as any).file
    if (!uploadedFile) {
      return res.status(400).json(createResponse(false, null, 'No file uploaded', 400))
    }

    // Extract version increment logic
    const currentVersion = existingFunction.version
    const versionParts = currentVersion.split('.').map(Number)
    versionParts[2] = (versionParts[2] || 0) + 1 // Increment patch version
    const newVersion = versionParts.join('.')
    
    const isUpdate = true

    // Prepare package for upload to MinIO
    let packagePath = uploadedFile.path
    const originalName = uploadedFile.originalname.toLowerCase()

    // Convert .zip files to .tgz for consistency
    if (originalName.endsWith('.zip')) {
      const extractDir = path.join(path.dirname(packagePath), `extract_${Date.now()}`)
      const tgzPath = path.join(path.dirname(packagePath), `${functionId}_${newVersion}.tgz`)
      
      try {
        // Extract zip
        const AdmZip = require('adm-zip')
        const zip = new AdmZip(packagePath)
        zip.extractAllTo(extractDir, true)
        
        // Create tar.gz
        await tar.create(
          { gzip: true, file: tgzPath, cwd: extractDir },
          fs.readdirSync(extractDir)
        )
        
        packagePath = tgzPath
        
        // Clean up
        await fs.remove(extractDir)
        console.log(`✓ Converted .zip to .tgz: ${tgzPath}`)
      } catch (error) {
        console.error('Error converting zip to tgz:', error)
        throw error
      }
    }

    // Upload package to MinIO
    const uploadResult = await minioService.uploadPackage(functionId, newVersion, packagePath)
    console.log(`✅ Package uploaded to MinIO: ${uploadResult.objectName}`)

    // Update function in database (only version, file_size, package_hash)
    await database.query(`
      UPDATE functions 
      SET version = $1, 
          file_size = $2, 
          package_hash = $3,
          updated_at = NOW()
      WHERE id = $4
    `, [newVersion, uploadResult.size, uploadResult.hash, functionId])
    
    console.log(`✅ Updated function ${existingFunction.name} to version ${newVersion}`)

    // Clean up temporary files
    await fs.remove(uploadedFile.path)
    if (packagePath !== uploadedFile.path) {
      await fs.remove(packagePath)
    }

    // Return updated function details
    const updatedFunctionResult = await database.query(
      'SELECT * FROM functions WHERE id = $1',
      [functionId]
    )

    return res.status(200).json(createResponse(true, updatedFunctionResult.rows[0], 
      'Function package updated successfully', 200))

  } catch (error) {
    console.error('Update error:', error)
    
    // Clean up uploaded file on error
    if (uploadedFile && uploadedFile.path) {
      try {
        await fs.remove(uploadedFile.path)
      } catch (cleanupError) {
        console.error('Error cleaning up uploaded file:', cleanupError)
      }
    }

    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}