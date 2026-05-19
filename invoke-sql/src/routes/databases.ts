import crypto from 'crypto'
import { Router, Request, Response } from 'express'
import { generateName } from '@criblinc/docker-names'
import database from '../services/database'
import { checkSqlBlocked } from '../lib/sql-filter'
import { encrypt, decrypt } from '../lib/crypto'

const { createUserdataConnection, createProjectDbConnection } = require('invoke-shared')

const router = Router()

const MAX_RESULT_ROWS = 1000
const STATEMENT_TIMEOUT_MS = 30000

function respondError(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, message })
}

router.post('/initialize', async (req: Request, res: Response) => {
  try {
    const { projectId, initializedBy } = req.body || {}
    if (!projectId || typeof projectId !== 'string') {
      return respondError(res, 400, 'Project ID is required')
    }

    if (projectId === 'system') {
      return respondError(res, 403, 'SQL database not available for system project')
    }

    const { ProjectDatabase, Project } = database.models
    const project = await Project.findByPk(projectId)
    if (!project) {
      return respondError(res, 404, 'Project not found')
    }

    const existing = await ProjectDatabase.findOne({ where: { project_id: projectId } })
    if (existing) {
      return respondError(res, 409, 'Database already initialized for this project')
    }

    const pool = createUserdataConnection()

    let idSuffix = ''
    let retries = 3

    while (!idSuffix && retries > 0) {
      const suffix = generateName().replaceAll(/-/g, '_').toLowerCase()
      const name = `project_${suffix}`
      const result = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
      if (result.rowCount === 0) {
        idSuffix = suffix
      } else {
        retries--
      }
    }

    if (retries <= 0 && !idSuffix) {
      idSuffix = projectId.replace(/-/g, '')
    }

    const dbName = `project_${idSuffix}`
    const appUsername = `app_${idSuffix}`
    const adminUsername = `admin_${idSuffix}`

    const appPassword = crypto.randomBytes(32).toString('hex')
    const adminPassword = crypto.randomBytes(32).toString('hex')

    try {
      const statements = [
        `CREATE USER "${appUsername}" WITH PASSWORD '${appPassword}' NOCREATEDB NOSUPERUSER NOINHERIT`,
        `CREATE USER "${adminUsername}" WITH PASSWORD '${adminPassword}' NOCREATEDB NOSUPERUSER NOINHERIT`,
        `ALTER ROLE "${adminUsername}" NOCREATEDB NOCREATEROLE`,
        `ALTER ROLE "${appUsername}" NOCREATEDB NOCREATEROLE`,
        `REVOKE CONNECT ON DATABASE postgres FROM "${adminUsername}"`,
        `REVOKE CONNECT ON DATABASE postgres FROM "${appUsername}"`,
        `CREATE DATABASE "${dbName}" OWNER "postgres"`,
        `REVOKE CONNECT ON DATABASE "${dbName}" FROM PUBLIC`,
        `GRANT CONNECT ON DATABASE "${dbName}" TO "${adminUsername}"`,
        `GRANT CONNECT ON DATABASE "${dbName}" TO "${appUsername}"`
      ]
      for (const stmt of statements) {
        await pool.query(stmt)
      }

      const projectPool = createProjectDbConnection({
        database: dbName,
        user: process.env.USERDATA_DB_USER || 'postgres',
        password: process.env.USERDATA_DB_PASSWORD || 'postgres'
      })

      try {
        const grantStatements = [
          `GRANT CONNECT ON DATABASE "${dbName}" TO "${adminUsername}"`,
          `GRANT USAGE, CREATE ON SCHEMA public TO "${adminUsername}"`,
          `GRANT ALL ON ALL TABLES IN SCHEMA public TO "${adminUsername}"`,
          `GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO "${adminUsername}"`,
          `GRANT CONNECT ON DATABASE "${dbName}" TO "${appUsername}"`,
          `GRANT USAGE ON SCHEMA public TO "${appUsername}"`,
          `ALTER DEFAULT PRIVILEGES FOR ROLE "${adminUsername}" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${appUsername}"`,
          `ALTER DEFAULT PRIVILEGES FOR ROLE "${adminUsername}" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${appUsername}"`
        ]
        for (const stmt of grantStatements) {
          await projectPool.query(stmt)
        }
      } finally {
        await projectPool.end()
      }

      const record = await ProjectDatabase.create({
        project_id: projectId,
        db_name: dbName,
        app_username: appUsername,
        admin_username: adminUsername,
        app_password_encrypted: encrypt(appPassword),
        admin_password_encrypted: encrypt(adminPassword),
        status: 'initialized',
        initialized_at: new Date(),
        initialized_by: initializedBy || null
      })

      return res.status(201).json({
        success: true,
        data: {
          id: record.id,
          db_name: dbName,
          app_username: appUsername,
          admin_username: adminUsername,
          status: 'initialized'
        }
      })
    } catch (dbError: any) {
      try {
        await pool.query(`DROP DATABASE IF EXISTS "${dbName}"`).catch(() => {})
        await pool.query(`DROP USER IF EXISTS "${appUsername}"`).catch(() => {})
        await pool.query(`DROP USER IF EXISTS "${adminUsername}"`).catch(() => {})
      } catch {}

      console.error('[SQL] Database initialization failed:', dbError)
      return respondError(res, 500, `Database initialization failed: ${dbError.message}`)
    } finally {
      await pool.end()
    }
  } catch (error: any) {
    console.error('[SQL] Initialize route error:', error)
    return respondError(res, 500, 'Internal server error')
  }
})

router.get('/:projectId/status', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params
    if (!projectId) {
      return respondError(res, 400, 'Project ID is required')
    }

    const { ProjectDatabase, Project } = database.models
    const record = await ProjectDatabase.findOne({ where: { project_id: projectId } })

    if (!record) {
      return res.status(200).json({ success: true, data: { initialized: false } })
    }

    const project = await Project.findByPk(projectId, { attributes: ['sql_storage_limit_bytes'] })
    const limitBytes = project ? parseInt(project.sql_storage_limit_bytes, 10) : 1073741824

    let storageBytes = 0
    try {
      const adminPassword = decrypt(record.admin_password_encrypted)
      const pool = createProjectDbConnection({
        database: record.db_name,
        user: record.admin_username,
        password: adminPassword
      })

      try {
        const result = await pool.query('SELECT pg_database_size(current_database()) AS size')
        storageBytes = parseInt(result.rows[0].size, 10)
      } finally {
        await pool.end()
      }
    } catch (err) {
      console.error('[SQL] Error querying database size:', err)
    }

    return res.status(200).json({
      success: true,
      data: {
        initialized: true,
        db_name: record.db_name,
        status: record.status,
        storage: {
          bytes: storageBytes,
          limit: limitBytes,
          percentage: limitBytes > 0 ? Math.round((storageBytes / limitBytes) * 10000) / 100 : 0
        },
        users: {
          app: record.app_username,
          admin: record.admin_username
        },
        initialized_at: record.initialized_at,
        initialized_by: record.initialized_by
      }
    })
  } catch (error) {
    console.error('[SQL] Status route error:', error)
    return respondError(res, 500, 'Internal server error')
  }
})

router.post('/:projectId/query', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params
    const { sql, sessionContext } = req.body || {}

    if (!projectId) {
      return respondError(res, 400, 'Project ID is required')
    }
    if (!sql || typeof sql !== 'string' || sql.trim().length === 0) {
      return respondError(res, 400, 'SQL query is required')
    }

    const sqlCheck = await checkSqlBlocked(sql)
    if (sqlCheck.blocked) {
      return respondError(res, 403, sqlCheck.reason || 'Query blocked by policy')
    }

    if (sessionContext && typeof sessionContext === 'string' && sessionContext.trim()) {
      const contextCheck = await checkSqlBlocked(sessionContext)
      if (contextCheck.blocked) {
        return respondError(res, 403, contextCheck.reason || 'Session SQL blocked by policy')
      }
    }

    const { ProjectDatabase, Project } = database.models
    const record = await ProjectDatabase.findOne({ where: { project_id: projectId } })
    if (!record) {
      return respondError(res, 404, 'Database not initialized for this project')
    }
    if (record.status !== 'initialized') {
      return respondError(res, 400, `Database is in '${record.status}' state`)
    }

    const project = await Project.findByPk(projectId, { attributes: ['sql_storage_limit_bytes'] })
    const limitBytes = project ? parseInt(project.sql_storage_limit_bytes, 10) : 1073741824

    const adminPassword = decrypt(record.admin_password_encrypted)
    const pool = createProjectDbConnection(
      {
        database: record.db_name,
        user: record.admin_username,
        password: adminPassword
      },
      {
        max: 1,
        statementTimeout: STATEMENT_TIMEOUT_MS
      }
    )

    const client = await pool.connect()
    try {
      if (sessionContext && typeof sessionContext === 'string' && sessionContext.trim()) {
        try {
          await client.query(sessionContext.trim())
        } catch (sessionError: any) {
          return res.status(200).json({ success: false, message: `Session SQL error: ${sessionError.message}` })
        }
      }

      const startTime = Date.now()
      const result = await client.query(sql)
      const durationMs = Date.now() - startTime

      const columns = result.fields ? result.fields.map((f: any) => f.name) : []
      let rows = result.rows || []
      const totalRows = rows.length
      const truncated = totalRows > MAX_RESULT_ROWS

      if (truncated) {
        rows = rows.slice(0, MAX_RESULT_ROWS)
      }

      const rowArrays = rows.map((row: any) => columns.map((col: string) => row[col]))

      let storageWarning: string | undefined
      const mutationCommands = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE']
      const firstWord = sql.trim().split(/\s+/)[0]?.toUpperCase()

      if (mutationCommands.includes(firstWord)) {
        try {
          const sizeResult = await client.query('SELECT pg_database_size(current_database()) AS size')
          const currentSize = parseInt(sizeResult.rows[0].size, 10)
          const limit = limitBytes
          if (currentSize > limit) {
            storageWarning = `Storage limit exceeded: ${(currentSize / 1024 / 1024).toFixed(1)}MB / ${(limit / 1024 / 1024).toFixed(1)}MB`
          }
        } catch {}
      }

      return res.status(200).json({
        success: true,
        data: {
          columns,
          rows: rowArrays,
          rowCount: result.rowCount ?? totalRows,
          totalRows,
          truncated,
          duration_ms: durationMs,
          command: result.command,
          ...(storageWarning && { storage_warning: storageWarning })
        }
      })
    } catch (queryError: any) {
      return res.status(200).json({ success: false, message: queryError.message })
    } finally {
      client.release()
      await pool.end()
    }
  } catch (error) {
    console.error('[SQL] Query route error:', error)
    return respondError(res, 500, 'Internal server error')
  }
})

router.delete('/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params
    const { confirmName } = req.body || {}

    if (!projectId) {
      return respondError(res, 400, 'Project ID is required')
    }

    const { Project, ProjectDatabase } = database.models

    const project = await Project.findByPk(projectId)
    if (!project) {
      return respondError(res, 404, 'Project not found')
    }

    if (!confirmName || confirmName !== project.name) {
      return respondError(res, 400, 'Confirmation required: provide project name in confirmName field')
    }

    const record = await ProjectDatabase.findOne({ where: { project_id: projectId } })
    if (!record) {
      return respondError(res, 404, 'Database not initialized for this project')
    }

    await record.update({ status: 'destroying' })

    const pool = createUserdataConnection()

    try {
      const destroyStatements = [
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${record.db_name}' AND pid <> pg_backend_pid()`,
        `DROP DATABASE IF EXISTS "${record.db_name}"`,
        `DROP USER IF EXISTS "${record.app_username}"`,
        `DROP USER IF EXISTS "${record.admin_username}"`
      ]
      for (const stmt of destroyStatements) {
        await pool.query(stmt)
      }

      await record.destroy()

      return res.status(200).json({ success: true, data: { destroyed: true } })
    } catch (dbError: any) {
      console.error('[SQL] Database destruction failed:', dbError)
      await record.update({ status: 'initialized' })
      return respondError(res, 500, `Database destruction failed: ${dbError.message}`)
    } finally {
      await pool.end()
    }
  } catch (error) {
    console.error('[SQL] Destroy route error:', error)
    return respondError(res, 500, 'Internal server error')
  }
})

export default router
