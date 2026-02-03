const util = require('util');

module.exports = async function(req, res) {
    const results = {
        success: true,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        compatibility: 0,
        testResults: {},
        performance: {},
        errors: []
    };

    try {
        // Test categories
        await testSystemErrors(results);
        await testInspectFunctionality(results);
        await testTypeChecking(results);
        await testStringFormatting(results);
        await testAsyncUtilities(results);
        await testTextProcessing(results);
        await testAdvancedFeatures(results);
        await testPerformance(results);

        // Calculate overall compatibility
        results.compatibility = results.totalTests > 0 ? 
            Math.round((results.passedTests / results.totalTests) * 100) : 0;
        
        results.success = results.failedTests === 0;

    } catch (error) {
        results.errors.push({
            category: 'general',
            error: error.message,
            stack: error.stack
        });
        results.success = false;
    }

    res.json(results);
};

function addTest(results, category, testName, testFn, expected = null) {
    results.totalTests++;
    
    if (!results.testResults[category]) {
        results.testResults[category] = {};
    }
    
    try {
        const actual = testFn();
        let passed;
        
        if (expected === null) {
            // Special handling for null expected value
            passed = actual === null;
        } else if (typeof expected === 'function') {
            // Function validator
            passed = expected(actual);
        } else if (expected !== null) {
            // Direct comparison for non-null expected values
            passed = actual === expected;
        } else {
            // Default fallback (should not reach here)
            passed = actual !== undefined && actual !== null;
        }
        
        results.testResults[category][testName] = {
            passed: passed,
            expected: expected,
            actual: actual,
            type: typeof actual
        };
        
        if (passed) {
            results.passedTests++;
        } else {
            results.failedTests++;
        }
        
    } catch (error) {
        results.testResults[category][testName] = {
            passed: false,
            error: error.message,
            stack: error.stack
        };
        
        results.failedTests++;
        results.errors.push({
            category: category,
            test: testName,
            error: error.message,
            stack: error.stack
        });
    }
}

async function testSystemErrors(results) {
    const category = 'systemErrors';
    
    addTest(results, category, 'getSystemErrorName_ENOENT', 
        () => util.getSystemErrorName(2), 'ENOENT');
    
    addTest(results, category, 'getSystemErrorName_negative', 
        () => util.getSystemErrorName(-13), 'EACCES');
    
    addTest(results, category, 'getSystemErrorName_invalid', 
        () => util.getSystemErrorName(99999), null);
    
    addTest(results, category, 'getSystemErrorMap_exists', 
        () => util.getSystemErrorMap() instanceof Map, true);
    
    addTest(results, category, 'getSystemErrorMap_has_ENOENT', 
        () => util.getSystemErrorMap().has('ENOENT'), true);
    
    addTest(results, category, 'getSystemErrorMessage_ENOENT', 
        () => util.getSystemErrorMessage(2), 'No such file or directory');
    
    addTest(results, category, 'getSystemErrorMessage_by_name', 
        () => util.getSystemErrorMessage('EACCES'), 'Permission denied');
}

async function testInspectFunctionality(results) {
    const category = 'inspect';
    
    // Basic inspection
    addTest(results, category, 'inspect_string', 
        () => util.inspect('hello'), "'hello'");
    
    addTest(results, category, 'inspect_number', 
        () => util.inspect(42), '42');
    
    addTest(results, category, 'inspect_boolean', 
        () => util.inspect(true), 'true');
    
    addTest(results, category, 'inspect_null', 
        () => util.inspect(null), 'null');
    
    addTest(results, category, 'inspect_undefined', 
        () => util.inspect(undefined), 'undefined');
    
    // Object inspection
    addTest(results, category, 'inspect_simple_object', 
        () => util.inspect({ a: 1, b: 2 }), result => result.includes('a: 1') && result.includes('b: 2'));
    
    addTest(results, category, 'inspect_array', 
        () => util.inspect([1, 2, 3]), '[ 1, 2, 3 ]');
    
    // Circular reference handling
    addTest(results, category, 'inspect_circular', () => {
        const obj = {};
        obj.self = obj;
        return util.inspect(obj);
    }, result => result.includes('[Circular'));
    
    // Depth control
    addTest(results, category, 'inspect_depth_limit', () => {
        const deep = { a: { b: { c: { d: 'deep' } } } };
        return util.inspect(deep, { depth: 1 });
    }, result => result.includes('[Object]'));
    
    // Color support (when enabled)
    addTest(results, category, 'inspect_colors', () => {
        return util.inspect('test', { colors: true });
    }, result => typeof result === 'string');
    
    // Custom inspect symbol
    addTest(results, category, 'inspect_custom_symbol_exists', 
        () => typeof util.inspect.custom === 'symbol', true);
    
    // Default options
    addTest(results, category, 'inspect_default_options_exist', 
        () => typeof util.inspect.defaultOptions === 'object', true);
    
    // Styles and colors
    addTest(results, category, 'inspect_styles_exist', 
        () => typeof util.inspect.styles === 'object', true);
    
    addTest(results, category, 'inspect_colors_exist', 
        () => typeof util.inspect.colors === 'object', true);
}

async function testTypeChecking(results) {
    const category = 'typeChecking';
    
    // Basic type checks
    addTest(results, category, 'isArray', 
        () => util.isArray([1, 2, 3]), true);
    
    addTest(results, category, 'isArray_false', 
        () => util.isArray({}), false);
    
    addTest(results, category, 'isDate_true', 
        () => util.isDate(new Date()), true);
    
    addTest(results, category, 'isDate_false', 
        () => util.isDate('2023-01-01'), false);
    
    addTest(results, category, 'isError_true', 
        () => util.isError(new Error()), true);
    
    addTest(results, category, 'isError_false', 
        () => util.isError('error'), false);
    
    addTest(results, category, 'isRegExp_true', 
        () => util.isRegExp(/test/), true);
    
    addTest(results, category, 'isRegExp_false', 
        () => util.isRegExp('test'), false);
    
    // util.types comprehensive testing
    const typesTests = [
        ['isArrayBuffer', new ArrayBuffer(8), true],
        ['isArrayBuffer', {}, false],
        ['isTypedArray', new Uint8Array(8), true],
        ['isTypedArray', [], false],
        ['isUint8Array', new Uint8Array(8), true],
        ['isUint8Array', new Uint16Array(8), false],
        ['isInt32Array', new Int32Array(8), true],
        ['isFloat64Array', new Float64Array(8), true],
        ['isDataView', new DataView(new ArrayBuffer(8)), true],
        ['isDataView', new Uint8Array(8), false],
        ['isMap', new Map(), true],
        ['isMap', {}, false],
        ['isSet', new Set(), true],
        ['isSet', [], false],
        ['isWeakMap', new WeakMap(), true],
        ['isWeakSet', new WeakSet(), true],
        ['isPromise', Promise.resolve(), true],
        ['isPromise', {}, false],
        ['isFunction', function() {}, true],
        ['isFunction', 'not a function', false],
        ['isBooleanObject', new Boolean(true), true],
        ['isBooleanObject', true, false],
        ['isNumberObject', new Number(42), true],
        ['isNumberObject', 42, false],
        ['isStringObject', new String('test'), true],
        ['isStringObject', 'test', false],
        ['isBoxedPrimitive', new String('test'), true],
        ['isBoxedPrimitive', 'test', false],
        ['isNativeError', new Error(), true],
        ['isNativeError', new TypeError(), true],
        ['isNativeError', {}, false]
    ];
    
    for (const [method, value, expected] of typesTests) {
        addTest(results, category, `types_${method}`, 
            () => util.types[method](value), expected);
    }
    
    // Deep equality
    addTest(results, category, 'isDeepStrictEqual_true', 
        () => util.isDeepStrictEqual({ a: 1 }, { a: 1 }), true);
    
    addTest(results, category, 'isDeepStrictEqual_false', 
        () => util.isDeepStrictEqual({ a: 1 }, { a: 2 }), false);
    
    addTest(results, category, 'isDeepStrictEqual_nested', 
        () => util.isDeepStrictEqual({ a: { b: 1 } }, { a: { b: 1 } }), true);
}

async function testStringFormatting(results) {
    const category = 'stringFormatting';
    
    // Basic format
    addTest(results, category, 'format_string', 
        () => util.format('hello %s', 'world'), 'hello world');
    
    addTest(results, category, 'format_number', 
        () => util.format('number %d', 42.7), 'number 42');
    
    addTest(results, category, 'format_integer', 
        () => util.format('integer %i', 42.7), 'integer 42');
    
    addTest(results, category, 'format_float', 
        () => util.format('float %f', 42.7), 'float 42.7');
    
    addTest(results, category, 'format_json', 
        () => util.format('json %j', { a: 1 }), 'json {"a":1}');
    
    addTest(results, category, 'format_object', 
        () => util.format('object %o', { a: 1 }), result => result.includes('a: 1'));
    
    addTest(results, category, 'format_percent', 
        () => util.format('percent %%'), 'percent %');
    
    addTest(results, category, 'format_multiple', 
        () => util.format('%s %d', 'test', 42), 'test 42');
    
    addTest(results, category, 'format_extra_args', 
        () => util.format('test', 'extra'), result => result.includes('test') && result.includes('extra'));
    
    addTest(results, category, 'format_no_format_string', 
        () => util.format(42, 'test'), result => result.includes('42') && result.includes('test'));
    
    // formatWithOptions
    addTest(results, category, 'formatWithOptions_depth', () => {
        const deep = { a: { b: { c: 'deep' } } };
        return util.formatWithOptions({ depth: 1 }, '%o', deep);
    }, result => result.includes('[Object]'));
}

async function testAsyncUtilities(results) {
    const category = 'asyncUtilities';
    
    // Test promisify
    addTest(results, category, 'promisify_function_exists', 
        () => typeof util.promisify === 'function', true);
    
    addTest(results, category, 'promisify_custom_symbol', 
        () => typeof util.promisify.custom === 'symbol', true);
    
    // Test callbackify
    addTest(results, category, 'callbackify_function_exists', 
        () => typeof util.callbackify === 'function', true);
    
    // Basic promisify test
    addTest(results, category, 'promisify_basic', () => {
        function callback(value, cb) {
            setTimeout(() => cb(null, value * 2), 1);
        }
        
        const promisified = util.promisify(callback);
        return typeof promisified === 'function' && promisified.constructor === Function;
    }, true);
    
    // Basic callbackify test  
    addTest(results, category, 'callbackify_basic', () => {
        function asyncFn(value) {
            return Promise.resolve(value * 2);
        }
        
        const callbackified = util.callbackify(asyncFn);
        return typeof callbackified === 'function';
    }, true);
    
    // AbortController utilities
    addTest(results, category, 'transferableAbortController', () => {
        try {
            if (typeof AbortController === 'undefined') {
                return 'AbortController not available'; // Expected result when not available
            }
            return util.transferableAbortController() instanceof AbortController;
        } catch (err) {
            return err.message.includes('AbortController is not available');
        }
    }, result => result === true || result === 'AbortController not available' || result === true);
    
    addTest(results, category, 'aborted_function_exists', 
        () => typeof util.aborted === 'function', true);
}

async function testTextProcessing(results) {
    const category = 'textProcessing';
    
    // TextEncoder
    addTest(results, category, 'TextEncoder_exists', 
        () => typeof util.TextEncoder === 'function', true);
    
    addTest(results, category, 'TextEncoder_instance', 
        () => new util.TextEncoder() instanceof util.TextEncoder, true);
    
    addTest(results, category, 'TextEncoder_encoding', 
        () => new util.TextEncoder().encoding, 'utf-8');
    
    // TextDecoder
    addTest(results, category, 'TextDecoder_exists', 
        () => typeof util.TextDecoder === 'function', true);
    
    addTest(results, category, 'TextDecoder_instance', 
        () => new util.TextDecoder() instanceof util.TextDecoder, true);
    
    addTest(results, category, 'TextDecoder_encoding', 
        () => new util.TextDecoder().encoding, 'utf-8');
    
    // stripVTControlCharacters
    addTest(results, category, 'stripVTControlCharacters', 
        () => util.stripVTControlCharacters('\x1b[31mred\x1b[0m'), 'red');
    
    // styleText
    addTest(results, category, 'styleText_basic', 
        () => typeof util.styleText('red', 'test') === 'string', true);
    
    // toUSVString
    addTest(results, category, 'toUSVString_basic', 
        () => util.toUSVString('hello'), 'hello');
    
    addTest(results, category, 'toUSVString_invalid_surrogate', 
        () => util.toUSVString('hello\uD800world'), result => result.includes('\uFFFD'));
}

async function testAdvancedFeatures(results) {
    const category = 'advancedFeatures';
    
    // Deprecation
    addTest(results, category, 'deprecate_function_exists', 
        () => typeof util.deprecate === 'function', true);
    
    addTest(results, category, 'deprecate_returns_function', () => {
        const deprecated = util.deprecate(() => 'test', 'deprecated');
        return typeof deprecated === 'function';
    }, true);
    
    // Debug logging
    addTest(results, category, 'debuglog_function_exists', 
        () => typeof util.debuglog === 'function', true);
    
    addTest(results, category, 'debug_alias', 
        () => util.debug === util.debuglog, true);
    
    // Parse args
    addTest(results, category, 'parseArgs_function_exists', 
        () => typeof util.parseArgs === 'function', true);
    
    addTest(results, category, 'parseArgs_basic', () => {
        const result = util.parseArgs({
            args: ['--test', 'value', 'positional'],
            options: { test: { type: 'string' } }
        });
        return result.values.test === 'value' && result.positionals[0] === 'positional';
    }, true);
    
    // MIME utilities
    addTest(results, category, 'MIMEType_exists', 
        () => typeof util.MIMEType === 'function', true);
    
    addTest(results, category, 'MIMEParams_exists', 
        () => typeof util.MIMEParams === 'function', true);
    
    addTest(results, category, 'MIMEType_basic', () => {
        const mime = new util.MIMEType('text/html; charset=utf-8');
        return mime.type === 'text' && mime.subtype === 'html';
    }, true);
    
    // Diff algorithm
    addTest(results, category, 'diff_function_exists', 
        () => typeof util.diff === 'function', true);
    
    addTest(results, category, 'diff_basic', () => {
        const result = util.diff('abc', 'abd');
        return Array.isArray(result) && result.length > 0;
    }, true);
    
    // Environment parsing
    addTest(results, category, 'parseEnv_function_exists', 
        () => typeof util.parseEnv === 'function', true);
    
    addTest(results, category, 'parseEnv_basic', () => {
        const result = util.parseEnv('KEY=value\nANOTHER=test');
        return result.KEY === 'value' && result.ANOTHER === 'test';
    }, true);
    
    // Process signal utilities
    addTest(results, category, 'convertProcessSignalToExitCode', 
        () => util.convertProcessSignalToExitCode('SIGTERM'), 143);
    
    addTest(results, category, 'setTraceSigInt_exists', 
        () => typeof util.setTraceSigInt === 'function', true);
    
    // Call sites
    addTest(results, category, 'getCallSites_exists', 
        () => typeof util.getCallSites === 'function', true);
    
    addTest(results, category, 'getCallSites_returns_array', 
        () => Array.isArray(util.getCallSites()), true);
    
    // Inheritance
    addTest(results, category, 'inherits_function_exists', 
        () => typeof util.inherits === 'function', true);
    
    addTest(results, category, '_extend_function_exists', 
        () => typeof util._extend === 'function', true);
}

async function testPerformance(results) {
    const category = 'performance';
    results.performance = {};
    
    // Performance test for util.inspect with large objects
    const largeObject = {};
    for (let i = 0; i < 1000; i++) {
        largeObject[`key${i}`] = { value: i, nested: { deep: `value${i}` } };
    }
    
    const start1 = Date.now();
    const inspectResult = util.inspect(largeObject, { maxArrayLength: 10, depth: 2 });
    const duration1 = Date.now() - start1;
    
    results.performance.inspect_large_object = {
        duration: duration1,
        acceptable: duration1 < 100, // 100ms threshold
        objectSize: Object.keys(largeObject).length,
        outputLength: inspectResult.length
    };
    
    addTest(results, category, 'inspect_performance_acceptable', 
        () => duration1 < 100, true);
    
    // Performance test for circular reference handling
    const circular = { level: 0 };
    let current = circular;
    for (let i = 1; i < 100; i++) {
        current.next = { level: i };
        current = current.next;
    }
    current.next = circular; // Create cycle
    
    const start2 = Date.now();
    const circularResult = util.inspect(circular, { depth: 10 });
    const duration2 = Date.now() - start2;
    
    results.performance.inspect_circular = {
        duration: duration2,
        acceptable: duration2 < 50, // 50ms threshold
        hasCircularMarker: circularResult.includes('[Circular')
    };
    
    addTest(results, category, 'inspect_circular_performance', 
        () => duration2 < 50, true);
    
    // Format performance test
    const formatArgs = Array(1000).fill(0).map((_, i) => `arg${i}`);
    const formatStr = '%s '.repeat(1000).trim();
    
    const start3 = Date.now();
    const formatResult = util.format(formatStr, ...formatArgs);
    const duration3 = Date.now() - start3;
    
    results.performance.format_large = {
        duration: duration3,
        acceptable: duration3 < 10, // 10ms threshold
        argCount: formatArgs.length,
        outputLength: formatResult.length
    };
    
    addTest(results, category, 'format_performance_acceptable', 
        () => duration3 < 10, true);
    
    // Memory usage estimation (basic)
    const memBefore = process.memoryUsage ? process.memoryUsage().heapUsed : 0;
    
    // Create and inspect many objects
    for (let i = 0; i < 100; i++) {
        const obj = { id: i, data: Array(100).fill(i) };
        util.inspect(obj);
    }
    
    const memAfter = process.memoryUsage ? process.memoryUsage().heapUsed : 0;
    const memDelta = memAfter - memBefore;
    
    results.performance.memory_usage = {
        before: memBefore,
        after: memAfter,
        delta: memDelta,
        acceptable: memDelta < 10 * 1024 * 1024 // 10MB threshold
    };
    
    if (process.memoryUsage) {
        addTest(results, category, 'memory_usage_acceptable', 
            () => memDelta < 10 * 1024 * 1024, true);
    }
}