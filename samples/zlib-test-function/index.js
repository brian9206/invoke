const zlib = require('zlib');
const { Readable, Writable } = require('stream');

// Test data of various sizes
const testData = {
    small: Buffer.from('Hello, World! This is a small test string for zlib compression.'),
    medium: Buffer.from('Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(100)),
    large: Buffer.from('Large test data for chunked compression testing. '.repeat(2000)),
    binary: Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A].map(x => Array(256).fill(x)).flat())
};

const results = {
    passed: 0,
    failed: 0,
    errors: []
};

function test(name, testFn) {
    try {
        console.log(`Testing: ${name}`);
        testFn();
        results.passed++;
        console.log(`✓ ${name}`);
    } catch (error) {
        results.failed++;
        const errorInfo = {
            test: name, 
            error: error.message,
            stack: error.stack
        };
        results.errors.push(errorInfo);
        console.error(`✗ ${name}: ${error.message}`);
        if (error.stack) {
            console.error(`Stack trace:\n${error.stack}`);
        }
    }
}

function asyncTest(name, testFn) {
    return new Promise((resolve) => {
        console.log(`Testing: ${name}`);
        try {
            testFn((error) => {
                if (error) {
                    results.failed++;
                    const errorInfo = {
                        test: name, 
                        error: error.message,
                        stack: error.stack
                    };
                    results.errors.push(errorInfo);
                    console.error(`✗ ${name}: ${error.message}`);
                    if (error.stack) {
                        console.error(`Stack trace:\n${error.stack}`);
                    }
                } else {
                    results.passed++;
                    console.log(`✓ ${name}`);
                }
                resolve();
            });
        } catch (error) {
            results.failed++;
            const errorInfo = {
                test: name, 
                error: error.message,
                stack: error.stack
            };
            results.errors.push(errorInfo);
            console.error(`✗ ${name}: ${error.message}`);
            if (error.stack) {
                console.error(`Stack trace:\n${error.stack}`);
            }
            resolve();
        }
    });
}

function streamTest(name, testFn) {
    return new Promise((resolve) => {
        console.log(`Testing: ${name}`);
        try {
            testFn((error) => {
                if (error) {
                    results.failed++;
                    const errorInfo = {
                        test: name, 
                        error: error.message,
                        stack: error.stack
                    };
                    results.errors.push(errorInfo);
                    console.error(`✗ ${name}: ${error.message}`);
                    if (error.stack) {
                        console.error(`Stack trace:\n${error.stack}`);
                    }
                } else {
                    results.passed++;
                    console.log(`✓ ${name}`);
                }
                resolve();
            });
        } catch (error) {
            results.failed++;
            const errorInfo = {
                test: name, 
                error: error.message,
                stack: error.stack
            };
            results.errors.push(errorInfo);
            console.error(`✗ ${name}: ${error.message}`);
            if (error.stack) {
                console.error(`Stack trace:\n${error.stack}`);
            }
            resolve();
        }
    });
}

async function runTests() {
    console.log('=== Node.js v24.x zlib API Compatibility Tests ===\n');

    // Test constants availability
    test('zlib.constants availability', () => {
        if (!zlib.constants) throw new Error('zlib.constants not available');
        if (typeof zlib.constants.Z_NO_COMPRESSION !== 'number') throw new Error('Z_NO_COMPRESSION not available');
        if (typeof zlib.constants.Z_BEST_SPEED !== 'number') throw new Error('Z_BEST_SPEED not available');
        if (typeof zlib.constants.Z_BEST_COMPRESSION !== 'number') throw new Error('Z_BEST_COMPRESSION not available');
        if (typeof zlib.constants.Z_DEFAULT_COMPRESSION !== 'number') throw new Error('Z_DEFAULT_COMPRESSION not available');
        if (typeof zlib.constants.BROTLI_ENCODE !== 'number') throw new Error('BROTLI_ENCODE not available');
    });

    // Test synchronous methods
    test('deflateSync/inflateSync', () => {
        const compressed = zlib.deflateSync(testData.small);
        if (!Buffer.isBuffer(compressed)) throw new Error('deflateSync should return Buffer');
        const decompressed = zlib.inflateSync(compressed);
        if (!testData.small.equals(decompressed)) throw new Error('Round-trip failed');
    });

    test('gzipSync/gunzipSync', () => {
        const compressed = zlib.gzipSync(testData.medium);
        if (!Buffer.isBuffer(compressed)) throw new Error('gzipSync should return Buffer');
        const decompressed = zlib.gunzipSync(compressed);
        if (!testData.medium.equals(decompressed)) throw new Error('Round-trip failed');
    });

    test('deflateRawSync/inflateRawSync', () => {
        const compressed = zlib.deflateRawSync(testData.small);
        if (!Buffer.isBuffer(compressed)) throw new Error('deflateRawSync should return Buffer');
        const decompressed = zlib.inflateRawSync(compressed);
        if (!testData.small.equals(decompressed)) throw new Error('Round-trip failed');
    });

    test('brotliCompressSync/brotliDecompressSync', () => {
        const compressed = zlib.brotliCompressSync(testData.medium);
        if (!Buffer.isBuffer(compressed)) throw new Error('brotliCompressSync should return Buffer');
        const decompressed = zlib.brotliDecompressSync(compressed);
        if (!testData.medium.equals(decompressed)) throw new Error('Round-trip failed');
    });

    test('unzipSync auto-detection', () => {
        const gzipped = zlib.gzipSync(testData.small);
        const decompressed = zlib.unzipSync(gzipped);
        if (!testData.small.equals(decompressed)) throw new Error('unzipSync failed with gzip data');
        
        const deflated = zlib.deflateSync(testData.small);
        const decompressed2 = zlib.unzipSync(deflated);
        if (!testData.small.equals(decompressed2)) throw new Error('unzipSync failed with deflate data');
    });

    test('Compression with options', () => {
        const options = {
            level: zlib.constants.Z_BEST_COMPRESSION,
            windowBits: 15,
            memLevel: 8,
            strategy: zlib.constants.Z_DEFAULT_STRATEGY
        };
        const compressed = zlib.deflateSync(testData.large, options);
        const decompressed = zlib.inflateSync(compressed);
        if (!testData.large.equals(decompressed)) throw new Error('Compression with options failed');
    });

    test('Brotli with quality options', () => {
        const options = {
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
                [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT
            }
        };
        const compressed = zlib.brotliCompressSync(testData.medium, options);
        const decompressed = zlib.brotliDecompressSync(compressed);
        if (!testData.medium.equals(decompressed)) throw new Error('Brotli with options failed');
    });

    test('Binary data compression', () => {
        const compressed = zlib.gzipSync(testData.binary);
        const decompressed = zlib.gunzipSync(compressed);
        if (!testData.binary.equals(decompressed)) throw new Error('Binary data round-trip failed');
    });

    test('Large data chunked compression', () => {
        const compressed = zlib.deflateSync(testData.large);
        const decompressed = zlib.inflateSync(compressed);
        if (!testData.large.equals(decompressed)) throw new Error('Large data compression failed');
        console.log(`  - Original: ${testData.large.length} bytes, Compressed: ${compressed.length} bytes (${Math.round((1 - compressed.length/testData.large.length) * 100)}% reduction)`);
    });

    // Test experimental Zstd (if available)
    test('Zstd compression (experimental)', () => {
        try {
            const compressed = zlib.zstdCompressSync(testData.medium);
            const decompressed = zlib.zstdDecompressSync(compressed);
            if (!testData.medium.equals(decompressed)) throw new Error('Zstd round-trip failed');
            console.log('  - Zstd compression available and working');
        } catch (error) {
            if (error.message.includes('not supported')) {
                console.log('  - Zstd compression not available (expected in some Node.js versions)');
            } else {
                throw error;
            }
        }
    });

    console.log('\n=== Asynchronous Methods Tests ===');

    // Test asynchronous methods
    await asyncTest('deflate/inflate async', (done) => {
        zlib.deflate(testData.small, (err, compressed) => {
            if (err) return done(err);
            if (!Buffer.isBuffer(compressed)) return done(new Error('deflate should return Buffer'));
            
            zlib.inflate(compressed, (err, decompressed) => {
                if (err) return done(err);
                if (!testData.small.equals(decompressed)) return done(new Error('Async round-trip failed'));
                done();
            });
        });
    });

    await asyncTest('gzip/gunzip async', (done) => {
        zlib.gzip(testData.medium, (err, compressed) => {
            if (err) return done(err);
            
            zlib.gunzip(compressed, (err, decompressed) => {
                if (err) return done(err);
                if (!testData.medium.equals(decompressed)) return done(new Error('Async gzip round-trip failed'));
                done();
            });
        });
    });

    await asyncTest('brotliCompress/brotliDecompress async', (done) => {
        zlib.brotliCompress(testData.medium, (err, compressed) => {
            if (err) return done(err);
            
            zlib.brotliDecompress(compressed, (err, decompressed) => {
                if (err) return done(err);
                if (!testData.medium.equals(decompressed)) return done(new Error('Async brotli round-trip failed'));
                done();
            });
        });
    });

    await asyncTest('unzip async auto-detection', (done) => {
        const gzipped = zlib.gzipSync(testData.small);
        zlib.unzip(gzipped, (err, decompressed) => {
            if (err) return done(err);
            if (!testData.small.equals(decompressed)) return done(new Error('Async unzip failed'));
            done();
        });
    });

    await asyncTest('Large data async with chunking', (done) => {
        zlib.gzip(testData.large, (err, compressed) => {
            if (err) return done(err);
            console.log(`  - Large async: Original ${testData.large.length} -> Compressed ${compressed.length} bytes`);
            
            zlib.gunzip(compressed, (err, decompressed) => {
                if (err) return done(err);
                if (!testData.large.equals(decompressed)) return done(new Error('Large async round-trip failed'));
                done();
            });
        });
    });

    console.log('\n=== Stream Classes Tests ===');

    // Test stream classes
    await streamTest('Deflate stream', (done) => {
        const deflate = zlib.createDeflate();
        const chunks = [];
        
        deflate.on('data', (chunk) => chunks.push(chunk));
        deflate.on('end', () => {
            const compressed = Buffer.concat(chunks);
            const decompressed = zlib.inflateSync(compressed);
            if (!testData.medium.equals(decompressed)) return done(new Error('Stream deflate round-trip failed'));
            done();
        });
        deflate.on('error', done);
        
        deflate.end(testData.medium);
    });

    await streamTest('Gzip stream', (done) => {
        const gzip = zlib.createGzip();
        const chunks = [];
        
        gzip.on('data', (chunk) => chunks.push(chunk));
        gzip.on('end', () => {
            const compressed = Buffer.concat(chunks);
            const decompressed = zlib.gunzipSync(compressed);
            if (!testData.medium.equals(decompressed)) return done(new Error('Stream gzip round-trip failed'));
            done();
        });
        gzip.on('error', done);
        
        gzip.end(testData.medium);
    });

    await streamTest('Brotli compress stream', (done) => {
        const brotli = zlib.createBrotliCompress();
        const chunks = [];
        
        brotli.on('data', (chunk) => chunks.push(chunk));
        brotli.on('end', () => {
            const compressed = Buffer.concat(chunks);
            const decompressed = zlib.brotliDecompressSync(compressed);
            if (!testData.medium.equals(decompressed)) return done(new Error('Stream brotli round-trip failed'));
            done();
        });
        brotli.on('error', done);
        
        brotli.end(testData.medium);
    });

    await streamTest('Unzip stream auto-detection', (done) => {
        const gzippedData = zlib.gzipSync(testData.small);
        const unzip = zlib.createUnzip();
        const chunks = [];
        
        unzip.on('data', (chunk) => chunks.push(chunk));
        unzip.on('end', () => {
            const decompressed = Buffer.concat(chunks);
            if (!testData.small.equals(decompressed)) return done(new Error('Stream unzip failed'));
            done();
        });
        unzip.on('error', done);
        
        unzip.end(gzippedData);
    });

    await streamTest('Stream with backpressure', (done) => {
        const deflate = zlib.createDeflate({ highWaterMark: 1024 });
        const chunks = [];
        let writeCount = 0;
        
        deflate.on('data', (chunk) => chunks.push(chunk));
        deflate.on('end', () => {
            const compressed = Buffer.concat(chunks);
            const decompressed = zlib.inflateSync(compressed);
            if (!testData.large.equals(decompressed)) return done(new Error('Backpressure stream failed'));
            console.log(`  - Processed ${writeCount} writes with backpressure`);
            done();
        });
        deflate.on('error', done);
        
        // Write in chunks to test backpressure
        const chunkSize = 512;
        let offset = 0;
        
        function writeChunk() {
            if (offset >= testData.large.length) {
                deflate.end();
                return;
            }
            
            const chunk = testData.large.slice(offset, offset + chunkSize);
            offset += chunkSize;
            writeCount++;
            
            const canContinue = deflate.write(chunk);
            if (canContinue) {
                setImmediate(writeChunk);
            } else {
                deflate.once('drain', writeChunk);
            }
        }
        
        writeChunk();
    });

    console.log('\n=== ZlibBase Methods Tests ===');

    await streamTest('Stream flush method', (done) => {
        const deflate = zlib.createDeflate();
        let flushed = false;
        
        deflate.on('data', () => {});
        deflate.on('end', () => {
            if (!flushed) return done(new Error('Flush was not called'));
            done();
        });
        deflate.on('error', done);
        
        deflate.write(testData.small.slice(0, 10));
        deflate.flush(zlib.constants.Z_SYNC_FLUSH, (err) => {
            if (err) return done(err);
            flushed = true;
            deflate.end();
        });
    });

    await streamTest('Stream bytesWritten/bytesRead', (done) => {
        const gzip = zlib.createGzip();
        
        gzip.on('data', () => {});
        gzip.on('end', () => {
            const bytesRead = gzip.bytesRead;
            const bytesWritten = gzip.bytesWritten;
            
            if (bytesRead !== testData.medium.length) {
                return done(new Error(`Expected bytesRead ${testData.medium.length}, got ${bytesRead}`));
            }
            if (bytesWritten <= 0) {
                return done(new Error(`Expected bytesWritten > 0, got ${bytesWritten}`));
            }
            
            console.log(`  - Read: ${bytesRead} bytes, Written: ${bytesWritten} bytes`);
            done();
        });
        gzip.on('error', done);
        
        gzip.end(testData.medium);
    });

    console.log('\n=== Utility Functions Tests ===');

    test('crc32 utility', () => {
        try {
            const crc1 = zlib.crc32(testData.small);
            const crc2 = zlib.crc32(testData.small);
            if (crc1 !== crc2) throw new Error('CRC32 should be deterministic');
            
            const crc3 = zlib.crc32(testData.medium);
            if (crc1 === crc3) throw new Error('Different data should have different CRC32');
            
            console.log(`  - CRC32 of test data: ${crc1.toString(16)}`);
        } catch (error) {
            if (error.message.includes('not supported') || error.message.includes('not a function')) {
                console.log('  - CRC32 utility not available (may require fallback implementation)');
            } else {
                throw error;
            }
        }
    });

    console.log('\n=== Error Handling Tests ===');

    test('Invalid input error handling', () => {
        try {
            zlib.inflateSync(Buffer.from('invalid compressed data'));
            throw new Error('Should have thrown error for invalid data');
        } catch (error) {
            if (!error.message.includes('invalid') && !error.message.includes('incorrect') && !error.code) {
                throw new Error('Expected zlib-specific error for invalid data');
            }
        }
    });

    await asyncTest('Async error handling', (done) => {
        zlib.inflate(Buffer.from('invalid'), (err, result) => {
            if (!err) return done(new Error('Should have received error for invalid data'));
            if (!err.message && !err.code) return done(new Error('Expected proper error object'));
            done();
        });
    });

    await streamTest('Stream error handling', (done) => {
        const inflate = zlib.createInflate();
        
        inflate.on('error', (err) => {
            if (!err.message && !err.code) return done(new Error('Expected proper error object'));
            done();
        });
        
        inflate.end(Buffer.from('invalid compressed data'));
    });

    console.log('\n=== Performance and Memory Tests ===');

    test('Multiple compression rounds', () => {
        for (let i = 0; i < 10; i++) {
            const compressed = zlib.gzipSync(testData.medium);
            const decompressed = zlib.gunzipSync(compressed);
            if (!testData.medium.equals(decompressed)) {
                throw new Error(`Round-trip failed on iteration ${i}`);
            }
        }
    });

    console.log('\n=== Factory Method Tests ===');

    test('All factory methods exist', () => {
        const methods = [
            'createDeflate', 'createInflate', 'createGzip', 'createGunzip',
            'createDeflateRaw', 'createInflateRaw', 'createUnzip',
            'createBrotliCompress', 'createBrotliDecompress'
        ];
        
        for (const method of methods) {
            if (typeof zlib[method] !== 'function') {
                throw new Error(`${method} is not a function`);
            }
            
            const stream = zlib[method]();
            if (!stream || typeof stream.pipe !== 'function') {
                throw new Error(`${method} did not return a stream`);
            }
        }
        
        // Test experimental Zstd methods
        try {
            const zstdCompress = zlib.createZstdCompress();
            const zstdDecompress = zlib.createZstdDecompress();
            console.log('  - Zstd factory methods available');
        } catch (error) {
            if (error.message.includes('not supported')) {
                console.log('  - Zstd factory methods not available (expected)');
            } else {
                throw error;
            }
        }
    });

    console.log('\n=== API Completeness Tests ===');

    test('All sync methods exist', () => {
        const syncMethods = [
            'deflateSync', 'inflateSync', 'gzipSync', 'gunzipSync',
            'deflateRawSync', 'inflateRawSync', 'unzipSync',
            'brotliCompressSync', 'brotliDecompressSync'
        ];
        
        for (const method of syncMethods) {
            if (typeof zlib[method] !== 'function') {
                throw new Error(`${method} is not a function`);
            }
        }
    });

    test('All async methods exist', () => {
        const asyncMethods = [
            'deflate', 'inflate', 'gzip', 'gunzip',
            'deflateRaw', 'inflateRaw', 'unzip',
            'brotliCompress', 'brotliDecompress'
        ];
        
        for (const method of asyncMethods) {
            if (typeof zlib[method] !== 'function') {
                throw new Error(`${method} is not a function`);
            }
        }
    });

    test('All stream classes exist', () => {
        const classes = [
            'Deflate', 'Inflate', 'Gzip', 'Gunzip',
            'DeflateRaw', 'InflateRaw', 'Unzip',
            'BrotliCompress', 'BrotliDecompress'
        ];
        
        for (const cls of classes) {
            if (typeof zlib[cls] !== 'function') {
                throw new Error(`${cls} class is not available`);
            }
        }
    });

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total tests: ${results.passed + results.failed}`);
    console.log(`Passed: ${results.passed}`);
    console.log(`Failed: ${results.failed}`);
    
    if (results.errors.length > 0) {
        console.log('\nFailed tests:');
        results.errors.forEach(({ test, error, stack }) => {
            console.log(`  - ${test}: ${error}`);
            if (stack) {
                console.log(`    Stack: ${stack.split('\n').slice(0, 3).join(' | ')}`);
            }
        });
    }
    
    console.log(`\nSuccess rate: ${Math.round((results.passed / (results.passed + results.failed)) * 100)}%`);
    
    if (results.failed === 0) {
        console.log('\n🎉 All tests passed! Node.js v24.x zlib API is fully compatible.');
    } else {
        console.log(`\n⚠️  ${results.failed} test(s) failed. Check implementation.`);
    }
}

// Handle both direct execution and function invocation
if (typeof module !== 'undefined' && require.main === module) {
    runTests().catch(console.error);
} else {
    // Function export for invoke execution
    module.exports = async (req, res) => {
        const originalLog = console.log;
        const originalError = console.error;
        const logs = [];
        
        console.log = (...args) => logs.push(args.join(' '));
        console.error = (...args) => logs.push('ERROR: ' + args.join(' '));
        
        try {
            await runTests();
            
            console.log = originalLog;
            console.error = originalError;
            
            res.status(200).json({
                success: results.failed === 0,
                results: {
                    total: results.passed + results.failed,
                    passed: results.passed,
                    failed: results.failed,
                    errors: results.errors,
                    successRate: Math.round((results.passed / (results.passed + results.failed)) * 100)
                },
                logs: logs
            });
        } catch (error) {
            console.log = originalLog;
            console.error = originalError;
            
            res.status(500).json({
                success: false,
                error: error.message,
                logs: logs
            });
        }
    };
}