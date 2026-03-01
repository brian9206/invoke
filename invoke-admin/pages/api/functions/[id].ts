import { QueryTypes } from 'sequelize'
import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectDeveloperAccess, checkProjectOwnerAccess } from '@/lib/project-access'
const { createResponse } = require('@/lib/utils')
const database = require('@/lib/database')

// Generate a random API key
const generateApiKey = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

async function handler(req: AuthenticatedRequest, res: any) {
  const { id } = req.query as { id: string }

  if (!id || typeof id !== 'string') {
    return res.status(400).json(createResponse(false, null, 'Function ID is required', 400))
  }

  const userId = req.user!.id

  if (req.method === 'GET') {
    // Get function details with active version information
    const [functionData] = await database.sequelize.query(`
      SELECT 
        f.id,
        f.name,
        f.description,
        f.is_active,
        f.created_at,
        f.updated_at,
        f.last_executed,
        f.execution_count,
        f.requires_api_key,
        f.api_key,
        f.active_version_id,
        f.project_id,
        p.name as project_name,
        fv.version as active_version,
        fv.file_size,
        fv.package_path,
        fv.package_hash,
        fv.created_at as version_created_at
      FROM functions f
      LEFT JOIN function_versions fv ON f.active_version_id = fv.id
      LEFT JOIN projects p ON f.project_id = p.id
      WHERE f.id = $1
    `, { bind: [id], type: QueryTypes.SELECT }) as any[];

      if (!functionData) {
        return res.status(404).json(createResponse(false, null, 'Function not found', 404))
      }
      // Verify project membership for non-admins
      if (!req.user?.isAdmin && functionData.project_id) {
        const access = await checkProjectDeveloperAccess(req.user!.id, functionData.project_id, false)
        if (!access.allowed) {
          return res.status(403).json(createResponse(false, null, 'Access denied to this project', 403))
        }
      }
      return res.status(200).json(createResponse(true, functionData, 'Function details retrieved', 200))

    } else if (req.method === 'PATCH') {
      // Update function details
      const { name, description, requires_api_key, is_active } = req.body

      // Check project access for non-admins (developer can update basic info, owner can update all)
      if (!req.user?.isAdmin) {
        const { FunctionModel } = database.models;
        const fn0 = await FunctionModel.findByPk(id, { attributes: ['project_id'] });
        if (!fn0) {
          return res.status(404).json(createResponse(false, null, 'Function not found', 404))
        }
        const projectId = fn0.project_id;
        if (projectId) {
          const access = await checkProjectDeveloperAccess(userId, projectId, false)
          if (!access.allowed) {
            return res.status(403).json(createResponse(false, null, 'Insufficient project permissions to update function', 403))
          }
        }
      }

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
          const { FunctionModel } = database.models;
          const existingRecord = await FunctionModel.findByPk(id, { attributes: ['api_key'] });
          
          if (existingRecord && !existingRecord.api_key) {
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

      const { FunctionModel: FnModel } = database.models;
      const fnCheck = await FnModel.findByPk(id, { attributes: ['project_id'] });
      if (!fnCheck) {
        return res.status(404).json(createResponse(false, null, 'Function not found', 404))
      }
      if (!req.user?.isAdmin) {
        const projectId = fnCheck.project_id;
        const access = await checkProjectDeveloperAccess(req.user!.id, projectId, false)
        if (!access.allowed) {
          return res.status(403).json(createResponse(false, null, access.message || 'Insufficient project permissions', 403))
        }
      }

      const [updatedResult] = await database.sequelize.query(updateQuery, { bind: updateValues, type: QueryTypes.SELECT }) as any[];

      if (!updatedResult) {
        return res.status(404).json(createResponse(false, null, 'Function not found', 404))
      }

      return res.status(200).json(createResponse(true, updatedResult, 'Function updated successfully', 200))


    } else if (req.method === 'DELETE') {
      // Check project access for non-admins
      if (!req.user?.isAdmin) {
        const { FunctionModel } = database.models;
        const fnForDelete = await FunctionModel.findByPk(id, { attributes: ['project_id'] });
        if (!fnForDelete) {
          return res.status(404).json(createResponse(false, null, 'Function not found', 404))
        }
        const projectId = fnForDelete.project_id;
        if (projectId) {
          const access = await checkProjectDeveloperAccess(userId, projectId, false)
          if (!access.allowed) {
            return res.status(403).json(createResponse(false, null, 'Insufficient project permissions to delete function', 403))
          }
        }
      }

      // Use centralized delete helper to remove MinIO packages and DB rows
      const { deleteFunction } = require('@/lib/delete-utils')

      try {
        const deletedPackages = await deleteFunction(id)
        return res.status(200).json(createResponse(true, null, `Function and ${deletedPackages} associated files deleted successfully`, 200))
      } catch (err) {
        if (err.message === 'Function not found') {
          return res.status(404).json(createResponse(false, null, 'Function not found', 404))
        }
        console.error('Error deleting function:', err)
        return res.status(500).json(createResponse(false, null, 'Failed to delete function', 500))
      }

    } else {
      return res.status(405).json(createResponse(false, null, 'Method not allowed', 405))
    }
}

export default withAuthOrApiKeyAndMethods(['GET', 'PATCH', 'DELETE'])(handler)