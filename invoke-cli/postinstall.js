try {
  require('./dist/postinstall.js');
}
catch (err) {
  console.warn('Postinstall script is not found. Ignoring...');
}
