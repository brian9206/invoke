import { NextApiRequest, NextApiResponse } from 'next'
import { adminRequired, AuthenticatedRequest } from '@/lib/middleware'
import { deleteFunction } from '@/lib/delete-utils'
import database from '@/lib/database'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return await getProjects(req, res)
    case 'POST':
      return await createProject(req, res)
    case 'PUT':
      return await updateProject(req, res)
    case 'DELETE':
      return await deleteProject(req, res)
    default:
      return res.status(405).json({ error: 'Method not allowed' })
  }
}

// Get all projects with member counts
async function getProjects(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { Project, User, ProjectMembership, Function: FunctionModel } = database.models

    const projects = (await Project.findAll({
      attributes: {
        include: [
          [
            database.sequelize.fn(
              'COUNT',
              database.sequelize.fn('DISTINCT', database.sequelize.col('ProjectMemberships.user_id'))
            ),
            'member_count'
          ],
          [
            database.sequelize.fn('COUNT', database.sequelize.fn('DISTINCT', database.sequelize.col('Functions.id'))),
            'function_count'
          ]
        ]
      },
      include: [
        { model: User, as: 'creator', attributes: ['username'], required: false },
        { model: ProjectMembership, attributes: [], required: false },
        { model: FunctionModel, attributes: [], required: false }
      ],
      group: ['Project.id', 'creator.id'],
      order: [['created_at', 'DESC']]
    })) as any[]

    res.json({
      projects: projects.map((p: any) => {
        const raw = p.toJSON()
        return {
          ...raw,
          created_by: raw.creator?.username ?? null,
          creator: undefined
        }
      })
    })
  } catch (error) {
    console.error('Error fetching projects:', error)
    res.status(500).json({ error: 'Failed to fetch projects' })
  }
}

// Create new project
async function createProject(req: AuthenticatedRequest, res: NextApiResponse) {
  const { name, description, slug, kv_storage_limit_bytes, sql_storage_limit_bytes } = req.body
  const userId = req.user?.id

  if (!name) {
    return res.status(400).json({ error: 'Project name is required' })
  }

  if (!slug) {
    return res.status(400).json({ error: 'Project slug is required' })
  }

  if (typeof name !== 'string' || name.length > 100) {
    return res.status(400).json({ error: 'Project name must be 100 characters or less' })
  }
  if (typeof slug !== 'string' || slug.length > 120) {
    return res.status(400).json({ error: 'Slug must be 120 characters or less' })
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) {
    return res.status(400).json({
      error:
        'Slug must start with a letter or number and contain only lowercase letters, numbers, hyphens, and underscores'
    })
  }
  if (description !== undefined && typeof description === 'string' && description.length > 1000) {
    return res.status(400).json({ error: 'Project description must be 1000 characters or less' })
  }

  try {
    const { Project, ProjectMembership, GlobalSetting } = database.models

    // Check if project name already exists
    const existingProject = await Project.findOne({ where: { name }, attributes: ['id'] })
    if (existingProject) {
      return res.status(400).json({ error: 'Project name already exists' })
    }

    // Check if slug already exists
    const existingSlug = await Project.findOne({ where: { slug }, attributes: ['id'] })
    if (existingSlug) {
      return res.status(400).json({ error: 'Slug already exists. Please choose a different slug.' })
    }

    // Get default quota limits from global settings
    const limitRecords = await GlobalSetting.findAll({
      where: { setting_key: ['kv_storage_limit_bytes', 'sql_storage_limit_bytes'] },
      attributes: ['setting_key', 'setting_value']
    })
    const limitMap = new Map(
      limitRecords.map((record: any) => [record.setting_key, parseInt(record.setting_value, 10)])
    )
    const defaultKvLimit = limitMap.get('kv_storage_limit_bytes') ?? 1073741824
    const defaultSqlLimit = limitMap.get('sql_storage_limit_bytes') ?? 1073741824

    // Create project
    const projectRecord = await Project.create({
      name,
      slug,
      description: description || null,
      created_by: userId,
      kv_storage_limit_bytes: kv_storage_limit_bytes ?? defaultKvLimit,
      sql_storage_limit_bytes: sql_storage_limit_bytes ?? defaultSqlLimit
    })
    const project = projectRecord.get({ plain: true })

    // Add creator as owner
    await ProjectMembership.create({
      project_id: project.id,
      user_id: userId,
      role: 'owner',
      created_by: userId
    })

    res.status(201).json({ project })
  } catch (error) {
    console.error('Error creating project:', error)
    res.status(500).json({ error: 'Failed to create project' })
  }
}

// Update project
async function updateProject(req: NextApiRequest, res: NextApiResponse) {
  const { id, name, description, slug, is_active, kv_storage_limit_bytes, sql_storage_limit_bytes } = req.body

  if (!id || !name) {
    return res.status(400).json({ error: 'Project ID and name are required' })
  }

  if (typeof name !== 'string' || name.length > 100) {
    return res.status(400).json({ error: 'Project name must be 100 characters or less' })
  }
  if (slug !== undefined) {
    if (typeof slug !== 'string' || slug.length > 120) {
      return res.status(400).json({ error: 'Slug must be 120 characters or less' })
    }
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) {
      return res.status(400).json({
        error:
          'Slug must start with a letter or number and contain only lowercase letters, numbers, hyphens, and underscores'
      })
    }
  }
  if (description !== undefined && typeof description === 'string' && description.length > 1000) {
    return res.status(400).json({ error: 'Project description must be 1000 characters or less' })
  }

  try {
    const { Project } = database.models
    const { Op } = require('sequelize')

    // If slug is provided, check uniqueness (exclude current project)
    if (slug) {
      const existingSlug = await Project.findOne({
        where: { slug, id: { [Op.ne]: id } },
        attributes: ['id']
      })
      if (existingSlug) {
        return res.status(400).json({ error: 'Slug already exists. Please choose a different slug.' })
      }
    }

    // Fetch current state so we know if is_active or slug is changing
    const existing = await Project.findByPk(id, {
      attributes: ['is_active', 'slug', 'kv_storage_limit_bytes', 'sql_storage_limit_bytes']
    })
    const activeChanged = existing && existing.is_active !== (is_active ?? true)
    const slugChanged = slug && existing && existing.slug !== slug
    const nextKvLimit = kv_storage_limit_bytes ?? existing?.kv_storage_limit_bytes ?? 1073741824
    const nextSqlLimit = sql_storage_limit_bytes ?? existing?.sql_storage_limit_bytes ?? 1073741824

    const updateData: any = {
      name,
      description: description || null,
      is_active: is_active ?? true,
      kv_storage_limit_bytes: nextKvLimit,
      sql_storage_limit_bytes: nextSqlLimit,
      updated_at: new Date()
    }
    if (slug) {
      updateData.slug = slug
    }

    const [affectedCount, updatedRows] = await Project.update(updateData, { where: { id }, returning: true })

    if (affectedCount === 0) {
      return res.status(404).json({ error: 'Project not found' })
    }

    // Notify gateway to invalidate its route cache when project active state or slug changes
    if (activeChanged || slugChanged) {
      await database.sequelize.query(`SELECT pg_notify('gateway_invalidated', :payload)`, {
        replacements: { payload: JSON.stringify({ table: 'projects', action: 'UPDATE', project_id: id }) }
      })
    }

    const updatedProject = updatedRows[0].get({ plain: true })
    res.json({ project: updatedProject })
  } catch (error) {
    console.error('Error updating project:', error)
    res.status(500).json({ error: 'Failed to update project' })
  }
}

// Delete project
async function deleteProject(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.body

  if (!id) {
    return res.status(400).json({ error: 'Project ID is required' })
  }

  try {
    const { Function: FunctionModel, Project } = database.models

    // Get all functions for the project
    const functions = await FunctionModel.findAll({
      where: { project_id: id },
      attributes: ['id']
    })

    let totalDeletedPackages = 0

    // Delete each function using centralized helper (removes MinIO packages and DB rows)
    for (const fn of functions) {
      const functionId = fn.id
      try {
        const deleted = await deleteFunction(functionId)
        totalDeletedPackages += deleted || 0
      } catch (err) {
        console.error(`Failed to delete function ${functionId}:`, err)
        // continue deleting other functions/projects even if one fails
      }
    }

    // Delete project (memberships will cascade)
    const deletedCount = await Project.destroy({ where: { id } })

    if (deletedCount === 0) {
      return res.status(404).json({ error: 'Project not found' })
    }

    res.json({
      success: true,
      message: `Project deleted successfully (removed ${functions.length} functions and ${totalDeletedPackages} MinIO packages)`
    })
  } catch (error) {
    console.error('Error deleting project:', error)
    res.status(500).json({ error: 'Failed to delete project' })
  }
}

export default adminRequired(handler)
