import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware'
const { createResponse } = require('@/lib/utils')

async function handler(req: AuthenticatedRequest, res: any) {
  const userData = {
    id: req.user!.id,
    username: req.user!.username,
    email: req.user!.email,
    isAdmin: req.user!.isAdmin
  }

  res.status(200).json(createResponse(true, userData, 'User authenticated'))
}

export default withAuthAndMethods(['GET'])(handler)