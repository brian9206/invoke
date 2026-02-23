import { NextApiRequest, NextApiResponse } from 'next'
import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectDeveloperAccess } from '@/lib/project-access'
const database = require('@/lib/database')

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const { id: functionId } = req.query
    const { versionId, version_number } = req.body

    if (!versionId && !version_number) {
      return res.status(400).json({
        success: false,
        message: 'Version ID or version number is required'
      })
    }

    // Check project access for non-admins
    if (!req.user?.isAdmin) {
      const functionResult = await database.query('SELECT project_id FROM functions WHERE id = $1', [functionId])
      if (functionResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Function not found'
        })
      }
      const projectId = functionResult.rows[0].project_id
      if (projectId) {
        const access = await checkProjectDeveloperAccess(req.user!.id, projectId, false)
        if (!access.allowed) {
          return res.status(403).json({
            success: false,
            message: access.message || 'Insufficient permissions to switch function version'
          })
        }
      }
    }

    // Verify that the version exists and belongs to the function
    // Support both versionId (UUID) and version_number (integer)
    let versionResult
    if (versionId) {
      versionResult = await database.query(
        'SELECT id, version FROM function_versions WHERE id = $1 AND function_id = $2',
        [versionId, functionId]
      )
    } else {
      versionResult = await database.query(
        'SELECT id, version FROM function_versions WHERE version = $1 AND function_id = $2',
        [version_number, functionId]
      )
    }

    if (versionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Version not found'
      })
    }

    const version = versionResult.rows[0]

    // Update the function's active version
    await database.query(
      'UPDATE functions SET active_version_id = $1, is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [version.id, functionId]
    )

    // Log the version switch
    console.log(`Function ${functionId} switched to version ${version.version} by user ${req.user!.id}`)

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

export default withAuthOrApiKeyAndMethods(['POST'])(handler)