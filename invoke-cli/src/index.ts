import { program } from 'commander';

// ========================================
// Program setup
// ========================================

program
  .name('invoke')
  .description('Invoke Platform Command Line Interface')
  .version(process.env.INVOKE_CLI_VERSION || '0.0.0');

// ========================================
// Register commands
// ========================================

import { register as configSet } from './commands/config-set';
import { register as configShow } from './commands/config-show';
import { register as configClear } from './commands/config-clear';

import { register as whoami } from './commands/whoami';

import { register as init } from './commands/init';

import { register as projectList } from './commands/project-list';

import { register as functionList } from './commands/function-list';
import { register as functionGet } from './commands/function-get';
import { register as functionCreate } from './commands/function-create';
import { register as functionUpdate } from './commands/function-update';
import { register as functionDelete } from './commands/function-delete';

import { register as functionEnvList } from './commands/function-env-list';
import { register as functionEnvSet } from './commands/function-env-set';
import { register as functionEnvDelete } from './commands/function-env-delete';

import { register as functionRetentionGet } from './commands/function-retention-get';
import { register as functionRetentionSet } from './commands/function-retention-set';

import { register as functionScheduleGet } from './commands/function-schedule-get';
import { register as functionScheduleSet } from './commands/function-schedule-set';
import { register as functionScheduleDisable } from './commands/function-schedule-disable';

import { register as functionVersionsList } from './commands/function-versions-list';
import { register as functionVersionsUpload } from './commands/function-versions-upload';
import { register as functionVersionsSwitch } from './commands/function-versions-switch';
import { register as functionVersionsDelete } from './commands/function-versions-delete';
import { register as functionVersionsDownload } from './commands/function-versions-download';
import { register as functionDeploy } from './commands/function-deploy';

import { register as functionLogs } from './commands/function-logs';

import { register as functionKeyShow } from './commands/function-key-show';
import { register as functionKeyRegenerate } from './commands/function-key-regenerate';

import { register as functionInvoke } from './commands/function-invoke';
import { register as functionTest } from './commands/function-test';

import { register as run } from './commands/run';
import { checkForUpdates } from './services/update';

configSet(program);
configShow(program);
configClear(program);

whoami(program);

init(program);

projectList(program);

functionList(program);
functionGet(program);
functionCreate(program);
functionUpdate(program);
functionDelete(program);

functionEnvList(program);
functionEnvSet(program);
functionEnvDelete(program);

functionRetentionGet(program);
functionRetentionSet(program);

functionScheduleGet(program);
functionScheduleSet(program);
functionScheduleDisable(program);

functionVersionsList(program);
functionVersionsUpload(program);
functionVersionsSwitch(program);
functionVersionsDelete(program);
functionVersionsDownload(program);
functionDeploy(program);

functionLogs(program);

functionKeyShow(program);
functionKeyRegenerate(program);

functionInvoke(program);
functionTest(program);

run(program);

// ========================================
// Parse
// ========================================

program.parseAsync(process.argv).then(checkForUpdates);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}


