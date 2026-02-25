#!/usr/bin/env node

const { program } = require('commander')
require('dotenv').config()

// ========================================
// Program setup
// ========================================

program
  .name('invoke')
  .description('Invoke Platform Command Line Interface')
  .version('1.0.0')

// ========================================
// Register commands
// ========================================

require('./commands/config-set').register(program)
require('./commands/config-show').register(program)
require('./commands/config-clear').register(program)

require('./commands/whoami').register(program)

require('./commands/project-list').register(program)

require('./commands/function-list').register(program)
require('./commands/function-get').register(program)
require('./commands/function-create').register(program)
require('./commands/function-update').register(program)
require('./commands/function-delete').register(program)

require('./commands/function-env-list').register(program)
require('./commands/function-env-set').register(program)
require('./commands/function-env-delete').register(program)

require('./commands/function-retention-get').register(program)
require('./commands/function-retention-set').register(program)

require('./commands/function-schedule-get').register(program)
require('./commands/function-schedule-set').register(program)
require('./commands/function-schedule-disable').register(program)

require('./commands/function-versions-list').register(program)
require('./commands/function-versions-upload').register(program)
require('./commands/function-versions-switch').register(program)
require('./commands/function-versions-delete').register(program)
require('./commands/function-versions-download').register(program)
require('./commands/function-deploy').register(program)

require('./commands/function-logs').register(program)

require('./commands/function-key-show').register(program)
require('./commands/function-key-regenerate').register(program)

require('./commands/function-invoke').register(program)
require('./commands/function-test').register(program)

require('./commands/user-create').register(program)
require('./commands/user-list').register(program)
require('./commands/user-delete').register(program)

require('./commands/db-status').register(program)

require('./commands/run').register(program)

// ========================================
// Parse
// ========================================

program.parse()

if (!process.argv.slice(2).length) {
  program.outputHelp()
}