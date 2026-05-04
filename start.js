const concurrently = require('concurrently')

const { result } = concurrently([
  {
    name: 'admin',
    command: 'npm run dev',
    cwd: './invoke-admin'
  },
  {
    name: 'gateway',
    command: 'npm run dev',
    cwd: './invoke-gateway'
  },
  {
    name: 'logger',
    command: 'npm run dev',
    cwd: './invoke-logger'
  },
  {
    name: 'scheduler',
    command: 'npm run dev',
    cwd: './invoke-scheduler'
  }
])
