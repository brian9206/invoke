const crypto = require('crypto');

module.exports = async function(req, res) {
    const resp = await fetch('http://httpbin.org/json');
    const fetchedData = await resp.json();

    const { name = 'World' } = req.query;

    res.setHeader('x-powered-by', 'Invoke');
    res.json({
        message: `Hello, ${name}!`,
        name: {
            base64: Buffer.from(name).toString('base64'),
            sha256: crypto.createHash('sha256').update(name).digest('hex')
        },
        fetchedData,
        timestamp: Date.now()
    });
}