const timers = require('timers');

module.exports = async function(event, context) {
    const results = [];
    
    results.push('=== Testing timers module ===\n');
    
    // Test 1: setTimeout returns Timeout object
    results.push('Test 1: setTimeout returns Timeout object');
    const timeout1 = timers.setTimeout(() => {
        results.push('  ✓ setTimeout callback executed');
    }, 100);
    results.push(`  ✓ timeout1 is instance of Timeout: ${timeout1 instanceof timers.Timeout}`);
    results.push(`  ✓ timeout1 has _id: ${typeof timeout1._id === 'number'}`);
    
    // Wait for timeout to complete
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Test 2: setInterval returns Timeout object
    results.push('\nTest 2: setInterval returns Timeout object');
    let intervalCount = 0;
    const interval1 = timers.setInterval(() => {
        intervalCount++;
        results.push(`  ✓ setInterval callback executed (${intervalCount})`);
        if (intervalCount >= 3) {
            timers.clearInterval(interval1);
            results.push('  ✓ clearInterval called');
        }
    }, 50);
    results.push(`  ✓ interval1 is instance of Timeout: ${interval1 instanceof timers.Timeout}`);
    
    // Wait for interval to complete
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Test 3: setImmediate returns Immediate object
    results.push('\nTest 3: setImmediate returns Immediate object');
    const immediate1 = timers.setImmediate(() => {
        results.push('  ✓ setImmediate callback executed');
    });
    results.push(`  ✓ immediate1 is instance of Immediate: ${immediate1 instanceof timers.Immediate}`);
    
    // Wait for immediate to complete
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Test 4: ref/unref/hasRef methods
    results.push('\nTest 4: ref/unref/hasRef methods');
    const timeout2 = timers.setTimeout(() => {}, 1000);
    results.push(`  ✓ Initial hasRef: ${timeout2.hasRef() === true}`);
    timeout2.unref();
    results.push(`  ✓ After unref, hasRef: ${timeout2.hasRef() === false}`);
    timeout2.ref();
    results.push(`  ✓ After ref, hasRef: ${timeout2.hasRef() === true}`);
    timers.clearTimeout(timeout2);
    results.push('  ✓ Timeout cleared');
    
    // Test 5: refresh method
    results.push('\nTest 5: refresh method');
    const timeout3 = timers.setTimeout(() => {
        results.push('  ✓ refresh test callback executed');
    }, 100);
    timeout3.refresh();
    results.push('  ✓ refresh() called successfully');
    
    // Wait for timeout to complete
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Test 6: Symbol.toPrimitive
    results.push('\nTest 6: Symbol.toPrimitive');
    const timeout4 = timers.setTimeout(() => {}, 1000);
    const primitiveValue = timeout4[Symbol.toPrimitive]();
    results.push(`  ✓ toPrimitive returns number: ${typeof primitiveValue === 'number'}`);
    results.push(`  ✓ toPrimitive value: ${primitiveValue}`);
    timers.clearTimeout(timeout4);
    
    // Test 7: clearTimeout with timer object
    results.push('\nTest 7: clearTimeout with timer object');
    let timeout5Executed = false;
    const timeout5 = timers.setTimeout(() => {
        timeout5Executed = true;
    }, 100);
    timers.clearTimeout(timeout5);
    await new Promise(resolve => setTimeout(resolve, 150));
    results.push(`  ✓ Timeout was cleared (executed: ${timeout5Executed})`);
    
    // Test 8: clearImmediate with immediate object
    results.push('\nTest 8: clearImmediate with immediate object');
    let immediate2Executed = false;
    const immediate2 = timers.setImmediate(() => {
        immediate2Executed = true;
    });
    timers.clearImmediate(immediate2);
    await new Promise(resolve => setTimeout(resolve, 50));
    results.push(`  ✓ Immediate was cleared (executed: ${immediate2Executed})`);
    
    // Test 9: Multiple arguments to setTimeout
    results.push('\nTest 9: Multiple arguments to setTimeout');
    await new Promise(resolve => {
        timers.setTimeout((a, b, c) => {
            results.push(`  ✓ Received arguments: ${a}, ${b}, ${c}`);
            resolve();
        }, 50, 'arg1', 'arg2', 'arg3');
    });
    
    // Test 10: Immediate ref/unref
    results.push('\nTest 10: Immediate ref/unref');
    const immediate3 = timers.setImmediate(() => {
        results.push('  ✓ Immediate with unref executed');
    });
    results.push(`  ✓ Initial hasRef: ${immediate3.hasRef() === true}`);
    immediate3.unref();
    results.push(`  ✓ After unref, hasRef: ${immediate3.hasRef() === false}`);
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    results.push('\n=== All tests completed ===');
    
    return {
        statusCode: 200,
        body: results.join('\n')
    };
};
