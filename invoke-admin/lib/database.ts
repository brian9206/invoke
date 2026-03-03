import { createServiceDatabase } from 'invoke-shared';

const database = createServiceDatabase({ poolMax: 20 });
export default database;
