import { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const siteKey = process.env.TURNSTILE_SITE_KEY || '1x00000000000000000000AA'

  return res.status(200).json({ siteKey })
}
