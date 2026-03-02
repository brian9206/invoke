const { createServiceDatabase } = require('invoke-shared');

module.exports = createServiceDatabase({ poolMax: 20 });
