const path = {};
module.exports = path;

path.join = (...args) => _path_join.applySync(undefined, args);
path.resolve = (...args) => _path_resolve.applySync(undefined, args);
path.dirname = (...args) => _path_dirname.applySync(undefined, args);
path.basename = (...args) => _path_basename.applySync(undefined, args);
path.extname = (...args) => _path_extname.applySync(undefined, args);
path.isAbsolute = (...args) => _path_isAbsolute.applySync(undefined, args);
path.normalize = (...args) => _path_normalize.applySync(undefined, args);
path.parse = (...args) => _path_parse.applySync(undefined, args);
path.format = (...args) => _path_format.applySync(undefined, args);
path.relative = (...args) => _path_relative.applySync(undefined, args);

// Path separators as direct string values (not functions)
path.sep = _path_sep;
path.delimiter = _path_delimiter;
