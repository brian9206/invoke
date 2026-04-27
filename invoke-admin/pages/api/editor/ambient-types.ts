import { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

// Serve the invoke runtime ambient type definitions for use in the Monaco code editor.
// This file is bundled with the repo and does not require authentication since it
// only contains public type information with no sensitive data.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).end()
  }

  try {
    const filePath = path.resolve(process.cwd(), '../invoke-runtime/types/dist/ambient.d.ts')
    const content = fs.readFileSync(filePath, 'utf8')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.status(200).send(content)
  } catch {
    res.status(404).json({ error: 'Type definitions not found' })
  }
}
