import { withAuthOrApiKeyAndMethods, AuthenticatedRequest, getUserProjects } from '@/lib/middleware'
const { createResponse } = require('@/lib/utils')

async function handler(req: AuthenticatedRequest, res: any) {
  // Get user's project memberships
  const projects = await getUserProjects(req.user!.id)

  const userData = {
    id: req.user!.id,
    username: req.user!.username,
    email: req.user!.email,
    isAdmin: req.user!.isAdmin,
    role: req.user!.isAdmin ? 'admin' : 'user',
    projects: projects
  }

  res.status(200).json(createResponse(true, userData, 'User authenticated'))
}

export default withAuthOrApiKeyAndMethods(['GET'])(handler)