import { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
const database = require('../../../../lib/database')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ 
      success: false, 
      message: `Method ${req.method} not allowed` 
    })
  }

  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' })
    }

    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
    let decoded
    try {
      decoded = jwt.verify(token, JWT_SECRET) as any
    } catch (error) {
      return res.status(401).json({ success: false, message: 'Invalid token' })
    }

    const { id: functionId } = req.query
    const { versionId } = req.body

    if (!versionId) {
      return res.status(400).json({
        success: false,
        message: 'Version ID is required'
      })
    }

    // Verify that the version exists and belongs to the function
    await database.connect()
    const versionResult = await database.query(
      'SELECT id, version FROM function_versions WHERE id = $1 AND function_id = $2',
      [versionId, functionId]
    )

    if (versionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Version not found'
      })
    }

    const version = versionResult.rows[0]

    // Update the function's active version
    await database.query(
      'UPDATE functions SET active_version_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [versionId, functionId]
    )

    // Log the version switch
    console.log(`Function ${functionId} switched to version ${version.version} by user ${decoded.id}`)

    return res.status(200).json({
      success: true,
      message: `Successfully switched to version ${version.version}`,
      data: {
        functionId,
        versionId,
        version: version.version
      }
    })

  } catch (error) {
    console.error('Error switching version:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    })
  }
}