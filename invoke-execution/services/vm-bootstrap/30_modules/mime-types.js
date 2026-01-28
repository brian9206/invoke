(function() {
    // Register module 'mime-types'
    const self = {};
    builtinModule['mime-types'] = self;

    self.lookup = (...args) => _mime_types_lookup.applySync(undefined, args);
    self.contentType = (...args) => _mime_types_contentType.applySync(undefined, args);
    self.extension = (...args) => _mime_types_extension.applySync(undefined, args);
    self.charset = (...args) => _mime_types_charset.applySync(undefined, args);

    self.types = new Proxy({}, {
        get(target, ext) {
            return _mime_types_types.applySync(undefined, args);
        }
    });

    self.types = new Proxy({}, {
        get(target, ext) {
            return _mime_types_extensions.applySync(undefined, args);
        }
    });
})();