import { Sequelize } from 'sequelize'
import { createServiceDatabase } from 'invoke-shared'

function createLogSequelize(): Sequelize {
  return new Sequelize(
    process.env.LOG_DB_NAME || 'invoke_logs',
    process.env.LOG_DB_USER || process.env.DB_USER || 'postgres',
    process.env.LOG_DB_PASSWORD ?? process.env.DB_PASSWORD,
    {
      host: process.env.LOG_DB_HOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.LOG_DB_PORT || process.env.DB_PORT || '5432', 10),
      dialect: 'postgres',
      pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
      logging: process.env.SEQUELIZE_LOG === 'true' ? console.log : false,
      define: { underscored: true, timestamps: false, freezeTableName: true }
    }
  )
}

/** Sequelize instance connected to the dedicated log DB (invoke_logs). */
export const logSequelize = createLogSequelize()

/** Full service database connected to the app DB (invoke_db) for read-only lookups. */
export const appDb = createServiceDatabase({ poolMax: 5 })
