const timersPromises = require('timers/promises');

module.exports = async function(event, context) {
    const results = [];
    
    results.push('=== Testing timers/promises module ===\n');
    
    // Test 1: setTimeout promise-based
    results.push('Test 1: setTimeout promise-based');
    const start1 = Date.now();
    const value1 = await timersPromises.setTimeout(100, 'resolved value');
    const elapsed1 = Date.now() - start1;
    results.push(`  ✓ setTimeout resolved with value: "${value1}"`);
    results.push(`  ✓ Elapsed time: ${elapsed1}ms (expected ~100ms)`);
    
    // Test 2: setTimeout with undefined value
    results.push('\nTest 2: setTimeout with undefined value');
    const value2 = await timersPromises.setTimeout(50);
    results.push(`  ✓ setTimeout resolved with value: ${value2} (type: ${typeof value2})`);
    
    // Test 3: setImmediate promise-based
    results.push('\nTest 3: setImmediate promise-based');
    const value3 = await timersPromises.setImmediate('immediate value');
    results.push(`  ✓ setImmediate resolved with value: "${value3}"`);
    
    // Test 4: setImmediate with undefined value
    results.push('\nTest 4: setImmediate with undefined value');
    const value4 = await timersPromises.setImmediate();
    results.push(`  ✓ setImmediate resolved with value: ${value4} (type: ${typeof value4})`);
    
    // Test 5: scheduler.wait
    results.push('\nTest 5: scheduler.wait');
    const start5 = Date.now();
    await timersPromises.scheduler.wait(100);
    const elapsed5 = Date.now() - start5;
    results.push(`  ✓ scheduler.wait completed`);
    results.push(`  ✓ Elapsed time: ${elapsed5}ms (expected ~100ms)`);
    
    // Test 6: scheduler.yield
    results.push('\nTest 6: scheduler.yield');
    const start6 = Date.now();
    await timersPromises.scheduler.yield();
    const elapsed6 = Date.now() - start6;
    results.push(`  ✓ scheduler.yield completed`);
    results.push(`  ✓ Elapsed time: ${elapsed6}ms (expected ~0ms)`);
    
    // Test 7: setInterval async iterator
    results.push('\nTest 7: setInterval async iterator');
    let iterCount = 0;
    const start7 = Date.now();
    for await (const value of timersPromises.setInterval(50, 'tick')) {
        iterCount++;
        results.push(`  ✓ Iteration ${iterCount}: value="${value}"`);
        if (iterCount >= 3) {
            break; // Test iterator cleanup via return()
        }
    }
    const elapsed7 = Date.now() - start7;
    results.push(`  ✓ Iterator completed after ${iterCount} iterations`);
    results.push(`  ✓ Total elapsed time: ${elapsed7}ms (expected ~150ms)`);
    
    // Test 8: AbortSignal with setTimeout
    results.push('\nTest 8: AbortSignal with setTimeout');
    const controller8 = new AbortController();
    const timeoutPromise8 = timersPromises.setTimeout(200, 'should not resolve', {
        signal: controller8.signal
    });
    
    // Abort after 50ms
    setTimeout(() => controller8.abort(), 50);
    
    try {
        await timeoutPromise8;
        results.push('  ✗ Promise should have been rejected');
    } catch (error) {
        results.push(`  ✓ Promise rejected with error: ${error.name}`);
        results.push(`  ✓ Error message: ${error.message}`);
        results.push(`  ✓ Error code: ${error.code}`);
    }
    
    // Test 9: AbortSignal with setImmediate
    results.push('\nTest 9: AbortSignal with setImmediate');
    const controller9 = new AbortController();
    controller9.abort(); // Abort immediately
    
    try {
        await timersPromises.setImmediate('should not resolve', {
            signal: controller9.signal
        });
        results.push('  ✗ Promise should have been rejected');
    } catch (error) {
        results.push(`  ✓ Promise rejected immediately with error: ${error.name}`);
    }
    
    // Test 10: AbortSignal with scheduler.wait
    results.push('\nTest 10: AbortSignal with scheduler.wait');
    const controller10 = new AbortController();
    const waitPromise10 = timersPromises.scheduler.wait(200, {
        signal: controller10.signal
    });
    
    setTimeout(() => controller10.abort(), 50);
    
    try {
        await waitPromise10;
        results.push('  ✗ Promise should have been rejected');
    } catch (error) {
        results.push(`  ✓ scheduler.wait rejected with error: ${error.name}`);
    }
    
    // Test 11: AbortSignal with setInterval iterator
    results.push('\nTest 11: AbortSignal with setInterval iterator');
    const controller11 = new AbortController();
    let abortIterCount = 0;
    
    setTimeout(() => controller11.abort(), 125); // Abort after ~2.5 iterations
    
    try {
        for await (const value of timersPromises.setInterval(50, 'tick', {
            signal: controller11.signal
        })) {
            abortIterCount++;
            results.push(`  ✓ Iteration ${abortIterCount}: value="${value}"`);
        }
        results.push('  ✗ Iterator should have thrown AbortError');
    } catch (error) {
        results.push(`  ✓ Iterator aborted after ${abortIterCount} iterations`);
        results.push(`  ✓ AbortError: ${error.name}`);
    }
    
    // Test 12: ref option (no-op but should not throw)
    results.push('\nTest 12: ref option');
    const value12 = await timersPromises.setTimeout(50, 'unref test', { ref: false });
    results.push(`  ✓ setTimeout with ref:false completed: "${value12}"`);
    
    await timersPromises.scheduler.wait(50, { ref: false });
    results.push(`  ✓ scheduler.wait with ref:false completed`);
    
    const value12b = await timersPromises.setImmediate('unref immediate', { ref: false });
    results.push(`  ✓ setImmediate with ref:false completed: "${value12b}"`);
    
    // Test 13: setInterval iterator with early return
    results.push('\nTest 13: setInterval iterator with early return');
    const iterator13 = timersPromises.setInterval(50, 'manual control');
    const result13a = await iterator13.next();
    results.push(`  ✓ Manual next() call 1: value="${result13a.value}", done=${result13a.done}`);
    
    const result13b = await iterator13.next();
    results.push(`  ✓ Manual next() call 2: value="${result13b.value}", done=${result13b.done}`);
    
    const returnResult = await iterator13.return();
    results.push(`  ✓ Manual return() called: done=${returnResult.done}`);
    
    const result13c = await iterator13.next();
    results.push(`  ✓ Next after return: done=${result13c.done}`);
    
    // Test 14: Multiple concurrent timers
    results.push('\nTest 14: Multiple concurrent timers');
    const start14 = Date.now();
    const promises14 = [
        timersPromises.setTimeout(100, 'timer1'),
        timersPromises.setTimeout(50, 'timer2'),
        timersPromises.setTimeout(75, 'timer3'),
        timersPromises.setImmediate('immediate1')
    ];
    const results14 = await Promise.all(promises14);
    const elapsed14 = Date.now() - start14;
    results.push(`  ✓ All timers resolved: [${results14.join(', ')}]`);
    results.push(`  ✓ Total time: ${elapsed14}ms (expected ~100ms for parallel execution)`);
    
    results.push('\n=== All tests completed ===');
    
    return {
        statusCode: 200,
        body: results.join('\n')
    };
};
