const { createDatabase } = require('./database')
const { initModels } = require('./models')
const { createServiceDatabase } = require('./service-database')
const s3Service = require('./s3')
const MigrationManager = require('./migration-manager')
const { createUserdataConnection, createProjectDbConnection } = require('./userdata-db')
const { joinUri } = require('./utils')

// Lazy-load createNotifyListener so that consumers that never use it
// (e.g. invoke-cli) don't pull pg-listen/pg-format into their bundle.
function createNotifyListener(...args) {
  return require('./pg-notify').createNotifyListener(...args)
}

module.exports = {
  createDatabase,
  initModels,
  createServiceDatabase,
  createNotifyListener,
  s3Service,
  MigrationManager,
  createUserdataConnection,
  createProjectDbConnection,
  joinUri
}
