(function() {
    // Register module 'path'
    const self = {};
    builtinModule['path'] = self;

    self.join = (...args) => _path_join.applySync(undefined, args);
    self.resolve = (...args) => _path_resolve.applySync(undefined, args);
    self.dirname = (...args) => _path_dirname.applySync(undefined, args);
    self.basename = (...args) => _path_basename.applySync(undefined, args);
    self.extname = (...args) => _path_extname.applySync(undefined, args);
    self.isAbsolute = (...args) => _path_isAbsolute.applySync(undefined, args);
    self.normalize = (...args) => _path_normalize.applySync(undefined, args);
    self.parse = (...args) => _path_parse.applySync(undefined, args);
    self.format = (...args) => _path_format.applySync(undefined, args);
    self.relative = (...args) => _path_relative.applySync(undefined, args);

    // Path separators as direct string values (not functions)
    self.sep = _path_sep;
    self.delimiter = _path_delimiter;
})();