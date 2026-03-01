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
    const { FunctionModel, FunctionVersion } = database.models;
    if (!req.user?.isAdmin) {
      const fn = await FunctionModel.findByPk(functionId, { attributes: ['project_id'] });
      if (!fn) {
        return res.status(404).json({
          success: false,
          message: 'Function not found'
        })
      }
      const projectId = fn.project_id;
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
    let versionRecord: any
    if (versionId) {
      versionRecord = await FunctionVersion.findOne({
        where: { id: versionId, function_id: functionId },
        attributes: ['id', 'version']
      });
    } else {
      versionRecord = await FunctionVersion.findOne({
        where: { version: version_number, function_id: functionId },
        attributes: ['id', 'version']
      });
    }

    if (!versionRecord) {
      return res.status(404).json({
        success: false,
        message: 'Version not found'
      })
    }

    // Update the function's active version
    await FunctionModel.update(
      { active_version_id: versionRecord.id, is_active: true, updated_at: new Date() },
      { where: { id: functionId } }
    );

    // Log the version switch
    console.log(`Function ${functionId} switched to version ${versionRecord.version} by user ${req.user!.id}`)

    return res.status(200).json({
      success: true,
      message: `Successfully switched to version ${versionRecord.version}`,
      data: {
        functionId,
        versionId,
        version: versionRecord.version
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