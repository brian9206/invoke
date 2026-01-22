// ============================================================================
// BOOTSTRAP HELPER - Request Object Creator
// ============================================================================
(function() {
    globalThis._createReqObject = function(reqData) {
        return {
            ...reqData,
            get(headerName) {
                return this.headers[headerName.toLowerCase()];
            },
            header(headerName) {
                return this.get(headerName);
            },
            is(type) {
                const contentType = this.headers['content-type'] || '';
                return contentType.includes(type);
            },
            accepts(types) {
                const acceptHeader = this.headers['accept'] || '*/*';
                if (typeof types === 'string') {
                    return acceptHeader.includes(types) ? types : false;
                }
                if (Array.isArray(types)) {
                    for (const type of types) {
                        if (acceptHeader.includes(type)) return type;
                    }
                    return false;
                }
                return acceptHeader;
            }
        };
    };
})();

// ============================================================================
// RESPONSE OBJECT - HTTP Response Interface
// ============================================================================
globalThis.res = {
    status(code) {
        _resStatus.applySync(undefined, [code]);
        return this;
    },
    json(data) {
        const jsonString = JSON.stringify(data);
        _resJson.applySync(undefined, [jsonString]);
        return this;
    },
    send(data) {
        let sendData;
        if (typeof data === 'string') {
            sendData = data;
        } else if (typeof data === 'object') {
            sendData = JSON.stringify(data);
        } else {
            sendData = String(data);
        }
        _resSend.applySync(undefined, [sendData]);
        return this;
    },
    sendFile(filePath, options) {
        _resSendFile.applySync(undefined, [filePath, options || {}]);
        return this;
    },
    setHeader(name, value) {
        _resSetHeader.applySync(undefined, [String(name), String(value)]);
        return this;
    },
    set(name, value) {
        return this.setHeader(name, value);
    },
    get(name) {
        return _resGet.applySync(undefined, [String(name)]);
    },
    end(data) {
        if (data !== undefined) {
            const endData = typeof data === 'object' ? JSON.stringify(data) : String(data);
            _resEnd.applySync(undefined, [endData]);
        }
        return this;
    }
};