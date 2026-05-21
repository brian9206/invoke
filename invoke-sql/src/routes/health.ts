import { Request, Response } from 'express'

export function handleHealthRoute(_req: Request, res: Response): void {
  res.status(200).json({ status: 'ok', service: 'invoke-sql' })
}
