'use strict'

const { Pool } = require('pg')

/**
 * Create a pg.Pool connection to the postgres-userdata server.
 * This is the SUPERUSER connection used for creating/dropping databases and users.
 * NOT for application data access — use Sequelize models for that.
 *
 * @param {object} [options]
 * @param {number} [options.max] - Maximum pool size (default: 5)
 * @returns {import('pg').Pool}
 */
function createUserdataConnection(options = {}) {
  const host = process.env.USERDATA_DB_HOST || 'localhost'
  const port = parseInt(process.env.USERDATA_DB_PORT || '5432', 10)
  const user = process.env.USERDATA_DB_USER || 'postgres'
  const password = process.env.USERDATA_DB_PASSWORD || 'postgres'

  return new Pool({
    host,
    port,
    user,
    password,
    max: options.max || 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  })
}

/**
 * Create a pg.Pool connection to a specific project database on postgres-userdata.
 *
 * @param {object} config
 * @param {string} config.database - The project database name
 * @param {string} config.user - The user to connect as
 * @param {string} config.password - The user's password
 * @param {object} [options]
 * @param {number} [options.max] - Maximum pool size (default: 3)
 * @param {number} [options.statementTimeout] - Statement timeout in ms (default: 30000)
 * @returns {import('pg').Pool}
 */
function createProjectDbConnection(config, options = {}) {
  const host = process.env.USERDATA_DB_HOST || 'localhost'
  const port = parseInt(process.env.USERDATA_DB_PORT || '5432', 10)

  return new Pool({
    host,
    port,
    user: config.user,
    password: config.password,
    database: config.database,
    max: options.max || 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    statement_timeout: options.statementTimeout || 30000
  })
}

module.exports = { createUserdataConnection, createProjectDbConnection }
