import { withAuthOrApiKeyAndMethods, AuthenticatedRequest } from '@/lib/middleware'
import { checkProjectDeveloperAccess } from '@/lib/project-access'
import fs from 'fs-extra'
import path from 'path'
import database from '@/lib/database'
import { createResponse } from '@/lib/utils'
import { ensureS3Initialized, downloadAndExtract } from '@/lib/source-utils'

interface SearchResult {
  path: string
  line: number
  lineText: string
  matchStart: number
  matchEnd: number
}

async function searchInDirectory(dirPath: string, query: string, maxResults = 1000): Promise<SearchResult[]> {
  const results: SearchResult[] = []
  const queryLower = query.toLowerCase()

  const walk = async (currentDir: string, relativePath: string) => {
    if (results.length >= maxResults) return
    let items: string[]
    try {
      items = await fs.readdir(currentDir)
    } catch {
      return
    }
    for (const item of items) {
      if (results.length >= maxResults) break
      const itemPath = path.join(currentDir, item)
      const itemRelPath = relativePath ? `${relativePath}/${item}` : item
      let stats
      try {
        stats = await fs.stat(itemPath)
      } catch {
        continue
      }
      if (stats.isDirectory()) {
        await walk(itemPath, itemRelPath)
      } else {
        try {
          const content = await fs.readFile(itemPath, 'utf8')
          const lines = content.split('\n')
          for (let i = 0; i < lines.length && results.length < maxResults; i++) {
            const lineText = lines[i]
            const lineLower = lineText.toLowerCase()
            let startIndex = 0
            let matchIndex = lineLower.indexOf(queryLower, startIndex)
            while (matchIndex !== -1 && results.length < maxResults) {
              results.push({
                path: itemRelPath,
                line: i + 1,
                lineText,
                matchStart: matchIndex,
                matchEnd: matchIndex + query.length
              })
              startIndex = matchIndex + 1
              matchIndex = lineLower.indexOf(queryLower, startIndex)
            }
          }
        } catch {
          // Skip binary or unreadable files
        }
      }
    }
  }

  await walk(dirPath, '')
  return results
}

async function handler(req: AuthenticatedRequest, res: any) {
  const { id: functionId, versionId, q: query } = req.query

  if (!functionId || !versionId || !query || typeof query !== 'string') {
    return res.status(400).json(createResponse(false, null, 'Function ID, Version ID and query (q) are required', 400))
  }

  if (query.trim().length === 0) {
    return res.status(200).json(createResponse(true, { results: [] }, 'No query'))
  }

  try {
    await ensureS3Initialized()

    const { FunctionVersion, Function: FunctionModel, Project } = database.models
    const versionRecord = (await FunctionVersion.findOne({
      where: { id: versionId, function_id: functionId },
      include: [
        {
          model: FunctionModel,
          attributes: ['name', 'project_id', 'active_version_id'],
          required: true,
          include: [{ model: Project, attributes: ['name'], required: false }]
        }
      ]
    })) as any

    if (!versionRecord) {
      return res.status(404).json(createResponse(false, null, 'Version not found', 404))
    }

    const versionRaw = versionRecord.toJSON()
    const project_id = versionRaw.Function?.project_id

    if (!req.user?.isAdmin) {
      const access = await checkProjectDeveloperAccess(req.user!.id, project_id, false)
      if (!access.allowed) {
        return res.status(403).json(createResponse(false, null, access.message || 'Access denied', 403))
      }
    }

    const tempBaseDir = process.env.TEMP_DIR || './.cache'
    const { tempFilePath, tempExtractPath } = await downloadAndExtract(versionRaw, String(functionId), tempBaseDir)

    try {
      const results = await searchInDirectory(tempExtractPath, query)
      await fs.remove(tempFilePath)
      await fs.remove(tempExtractPath)

      return res.status(200).json(createResponse(true, { results }, `Found ${results.length} result(s)`))
    } catch (error) {
      try {
        await fs.remove(tempFilePath)
        await fs.remove(tempExtractPath)
      } catch {}
      throw error
    }
  } catch (error) {
    console.error('Error searching source:', error)
    return res.status(500).json(createResponse(false, null, 'Internal server error', 500))
  }
}

export default withAuthOrApiKeyAndMethods(['GET'])(handler)
