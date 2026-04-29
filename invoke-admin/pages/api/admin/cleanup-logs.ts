import crypto from 'crypto'
import { Op } from 'sequelize'
import { NextApiRequest, NextApiResponse } from 'next'
import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'
import { proxyToLogger } from '@/lib/logger-proxy'

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    const { functionId } = req.body // Optional - if not provided, cleans all functions

    // Proxy log cleanup to logger service
    const logResult = await proxyToLogger<{ deleted: number; functions: number }>('/cleanup', {
      method: 'POST',
      body: functionId ? { functionId } : {}
    })

    if (!logResult.success) {
      return res
        .status(logResult.status)
        .json(createResponse(false, null, logResult.message ?? 'Log cleanup failed', logResult.status))
    }

    const { deleted = 0, functions = 0 } = logResult.data ?? {}

    // Clean up expired refresh tokens (stays in admin — app DB concern)
    let expiredTokensDeleted = 0
    try {
      const { RefreshToken } = database.models
      expiredTokensDeleted = await RefreshToken.destroy({
        where: { expires_at: { [Op.lt]: new Date() } }
      })
      if (expiredTokensDeleted > 0) {
        console.log(`Cleaned ${expiredTokensDeleted} expired refresh tokens`)
      }
    } catch (tokenError) {
      console.error('Error cleaning expired refresh tokens:', tokenError)
    }

    res.json(
      createResponse(
        true,
        {
          deleted,
          functions,
          expiredTokensDeleted
        },
        `Cleanup completed: ${deleted} logs deleted from ${functions} functions, ${expiredTokensDeleted} expired tokens removed`
      )
    )
  } catch (error) {
    console.error('Cleanup error:', error)
    res.status(500).json(createResponse(false, null, 'Cleanup failed'))
  }
}

export default function routeHandler(req: NextApiRequest, res: NextApiResponse) {
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET
  const headerSecret = req.headers['x-internal-secret'] as string | undefined
  if (internalSecret && headerSecret && internalSecret.length === headerSecret.length) {
    const isMatch = crypto.timingSafeEqual(Buffer.from(internalSecret), Buffer.from(headerSecret))
    if (isMatch) {
      console.log(`[audit] Internal service bypass used for cleanup-logs from ${req.socket.remoteAddress}`)
      return handler(req as AuthenticatedRequest, res)
    }
  }
  return withAuthAndMethods(['POST'], { adminRequired: true })(handler)(req as AuthenticatedRequest, res)
}
