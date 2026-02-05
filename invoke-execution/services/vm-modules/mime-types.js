const mimeTypes = {};
module.exports = mimeTypes;

mimeTypes.lookup = (...args) => _mime_types_lookup.applySync(undefined, args);
mimeTypes.contentType = (...args) => _mime_types_contentType.applySync(undefined, args);
mimeTypes.extension = (...args) => _mime_types_extension.applySync(undefined, args);
mimeTypes.charset = (...args) => _mime_types_charset.applySync(undefined, args);

mimeTypes.types = new Proxy({}, {
    get(target, ext) {
        return _mime_types_types.applySync(undefined, args);
    }
});

mimeTypes.types = new Proxy({}, {
    get(target, ext) {
        return _mime_types_extensions.applySync(undefined, args);
    }
});

