require('dotenv').config()

module.exports = {
  development: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'invoke_db',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    dialect: 'postgres',
    migrationStorageTableName: 'SequelizeMeta'
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    dialect: 'postgres',
    migrationStorageTableName: 'SequelizeMeta',
    dialectOptions: {
      ssl:
        process.env.DB_SSL === 'true'
          ? {
              require: true,
              rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
              ca: process.env.DB_SSL_CA ? require('fs').readFileSync(process.env.DB_SSL_CA) : undefined
            }
          : false
    }
  }
}
