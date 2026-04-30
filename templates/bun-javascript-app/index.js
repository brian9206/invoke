import crypto from 'crypto'

const router = new Router()

router.get('/', async (req, res) => {
  const resp = await fetch('http://httpbin.org/json')
  const fetchedData = await resp.json()

  const { name = 'World' } = req.query

  res.setHeader('x-powered-by', 'Invoke')
  res.json({
    message: `Hello, ${name}!`,
    name: {
      base64: Buffer.from(name).toString('base64'),
      sha256: crypto.createHash('sha256').update(name).digest('hex')
    },
    fetchedData,
    timestamp: Date.now()
  })
})

// call /setData?data=someValue to set someValue in the KV store under the key 'fetchedData'
router.get('/setData', async (req, res) => {
  await kv.set('fetchedData', req.query.data || '')
  res.json({ message: 'Data set successfully' })
})

export default router
