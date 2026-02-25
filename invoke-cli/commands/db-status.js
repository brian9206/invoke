const chalk = require('chalk')
const database = require('../services/database')

function register(program) {
  program
    .command('db:status')
    .description('Check database connection and show statistics')
    .action(async () => {
      try {
        console.log(chalk.cyan('🔍 Checking database connection...'))

        await database.connect()
        console.log(chalk.green('✅ Database connected successfully'))

        // Get statistics
        const stats = await Promise.all([
          database.query('SELECT COUNT(*) as count FROM users'),
          database.query('SELECT COUNT(*) as count FROM functions WHERE is_active = true'),
          database.query('SELECT COUNT(*) as count FROM execution_logs WHERE executed_at > NOW() - INTERVAL \'1 day\'')
        ])

        console.log('')
        console.log(chalk.cyan('📊 Database Statistics:'))
        console.log(`Users: ${stats[0].rows[0].count}`)
        console.log(`Active Functions: ${stats[1].rows[0].count}`)
        console.log(`Executions (24h): ${stats[2].rows[0].count}`)
      } catch (error) {
        console.log(chalk.red('❌ Database connection failed:'), error.message)
        process.exit(1)
      } finally {
        await database.close()
      }
    })
}

module.exports = { register }
