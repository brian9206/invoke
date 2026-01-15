import { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
const { createResponse } = require('../../../lib/utils')
const database = require('../../../lib/database')

// Generate a random API key
const generateApiKey = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await database.connect()

    const { id } = req.query

    if (!id || typeof id !== 'string') {
      return res.status(400).json(createResponse(false, null, 'Function ID is required', 400))
    }

    // Extract and verify JWT token
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(createResponse(false, null, 'Authorization header required', 401))
    }

    const token = authHeader.substring(7)
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
    
    let userId: number
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any
      userId = decoded.id
    } catch (error) {
      return res.status(401).json(createResponse(false, null, 'Invalid or expired token', 401))
    }

    if (req.method === 'GET') {
      // Get function details with active version information
      const result = await database.query(`
        SELECT 
          f.id,
          f.name,
          f.description,
          f.is_active,
          f.created_at,
          f.last_executed,
          f.execution_count,
          f.requires_api_key,
          f.api_key,
          fv.version,
          fv.file_size,
          fv.package_path,
          fv.package_hash,
          fv.created_at as version_created_at
        FROM functions f
        LEFT JOIN function_versions fv ON f.active_version_id = fv.id
        WHERE f.id = $1
      `, [id])

      if (result.rows.length === 0) {
        return res.status(404).json(createResponse(false, null, 'Function not found', 404))
      }

      const functionData = result.rows[0]
      return res.status(200).json(createResponse(true, functionData, 'Function details retrieved', 200))

    } else if (req.method === 'PATCH') {
      // Update function details
      const { name, description, requires_api_key, is_active } = req.body

      let updateFields: string[] = []
      let updateValues: any[] = []
      let paramCount = 1

      if (name !== undefined) {
        updateFields.push(`name = $${paramCount}`)
        updateValues.push(name)
        paramCount++
      }

      if (description !== undefined) {
        updateFields.push(`description = $${paramCount}`)
        updateValues.push(description)
        paramCount++
      }

      if (requires_api_key !== undefined) {
        updateFields.push(`requires_api_key = $${paramCount}`)
        updateValues.push(requires_api_key)
        paramCount++

        // If enabling API key requirement and no key exists, generate one
        if (requires_api_key) {
          const existingResult = await database.query(
            'SELECT api_key FROM functions WHERE id = $1',
            [id]
          )
          
          if (existingResult.rows.length > 0 && !existingResult.rows[0].api_key) {
            updateFields.push(`api_key = $${paramCount}`)
            updateValues.push(generateApiKey())
            paramCount++
          }
        }
      }

      if (is_active !== undefined) {
        updateFields.push(`is_active = $${paramCount}`)
        updateValues.push(is_active)
        paramCount++
      }

      if (updateFields.length === 0) {
        return res.status(400).json(createResponse(false, null, 'No fields to update', 400))
      }

      // Add updated_at field
      updateFields.push(`updated_at = NOW()`)
      
      // Add the WHERE condition
      updateValues.push(id)

      const updateQuery = `
        UPDATE functions 
        SET ${updateFields.join(', ')} 
        WHERE id = $${paramCount}
        RETURNING *
      `

      const updateResult = await database.query(updateQuery, updateValues)

      if (updateResult.rows.length === 0) {
        return res.status(404).json(createResponse(false, null, 'Function not found', 404))
      }

      return res.status(200).json(createResponse(true, updateResult.rows[0], 'Function updated successfully', 200))

    } else if (req.method === 'DELETE') {
      // Delete function
      // First get all versions to clean up MinIO files BEFORE database deletion
      const versionsResult = await database.query(
        'SELECT version FROM function_versions WHERE function_id = $1',
        [id]
      )

      // Delete function from database (this will cascade delete versions due to foreign key)
      const deleteResult = await database.query(
        'DELETE FROM functions WHERE id = $1 RETURNING *',
        [id]
      )

      if (deleteResult.rows.length === 0) {
        return res.status(404).json(createResponse(false, null, 'Function not found', 404))
      }

      // Clean up MinIO files for each version
      const minioService = require('../../../lib/minio')
      let deletedPackages = 0
      
      try {
        for (const versionRow of versionsResult.rows) {
          try {
            await minioService.deletePackage(id, versionRow.version)
            deletedPackages++
          } catch (minioError) {
            console.error(`Error deleting MinIO package for version ${versionRow.version}:`, minioError)
            // Continue with other versions even if one fails
          }
        }
        console.log(`✓ Cleaned up ${deletedPackages}/${versionsResult.rows.length} MinIO packages for function ${id}`)
      } catch (error) {
        console.error('Error during MinIO cleanup:', error)
        // Continue even if MinIO cleanup fails
      }

      // Note: Cache invalidation across distributed execution nodes will happen
      // naturally when they try to access the deleted function and get a 404 from database/MinIO

      return res.status(200).json(createResponse(true, null, `Function and ${deletedPackages} associated files deleted successfully`, 200))

    } else {
      return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
    }

  } catch (error) {
    console.error('Function API error:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}