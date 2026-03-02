const chalk = require('chalk')
const { QueryTypes } = require('sequelize')
const database = require('../services/database')

function register(program) {
  program
    .command('db:status')
    .description('Check database connection and show statistics')
    .action(async () => {
      try {
        console.log(chalk.cyan('🔍 Checking database connection...'))

        console.log(chalk.green('✅ Database connected successfully'))

        // Get statistics
        const stats = await Promise.all([
          database.sequelize.query('SELECT COUNT(*) as count FROM users', { type: QueryTypes.SELECT }),
          database.sequelize.query('SELECT COUNT(*) as count FROM functions WHERE is_active = true', { type: QueryTypes.SELECT }),
          database.sequelize.query(`SELECT COUNT(*) as count FROM execution_logs WHERE executed_at > NOW() - INTERVAL '1 day'`, { type: QueryTypes.SELECT })
        ])

        console.log('')
        console.log(chalk.cyan('📊 Database Statistics:'))
        console.log(`Users: ${stats[0][0].count}`)
        console.log(`Active Functions: ${stats[1][0].count}`)
        console.log(`Executions (24h): ${stats[2][0].count}`)
      } catch (error) {
        console.log(chalk.red('❌ Database connection failed:'), error.message)
        process.exit(1)
      } finally {
        await database.close()
      }
    })
}

module.exports = { register }
