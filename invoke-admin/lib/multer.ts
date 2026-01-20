import { NextApiRequest, NextApiResponse } from 'next'

// Helper to run a multer middleware (or any express-style middleware)
// from a Next.js API route and await its completion.
export function runMiddleware(mw: any) {
  return (req: NextApiRequest, res: NextApiResponse) => {
    return new Promise<void>((resolve, reject) => {
      try {
        mw(req as any, res as any, (err: any) => {
          if (err) return reject(err)
          resolve()
        })
      } catch (error) {
        reject(error)
      }
    })
  }
}

export default runMiddleware
