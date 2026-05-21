import { createServiceDatabase } from 'invoke-shared'

const database = createServiceDatabase({ poolMax: 10 })
export default database
