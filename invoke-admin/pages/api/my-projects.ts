import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, getUserProjects, AuthenticatedRequest } from '@/lib/middleware';
const database = require('@/lib/database');
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const projects = await getUserProjects(req.user!.id);
    res.json({ projects });
  } catch (error) {
    console.error('Error fetching user projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
}

export default withAuth(handler);
