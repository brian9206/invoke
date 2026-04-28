import { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

// Whitelisted packages only — never allow arbitrary path traversal.
const PACKAGE_DIRS: Record<string, string> = {
  node: path.resolve(process.cwd(), 'node_modules/@types/node'),
  bun: path.resolve(process.cwd(), '../invoke-runtime/types/node_modules/bun-types'),
}

// Subdirectories to skip within a package.
const SKIP_DIRS: Record<string, string[]> = {
  bun: ['vendor'],
}

function collectFiles(
  dir: string,
  relBase: string,
  skipDirs: string[],
  result: Record<string, string> = {},
): Record<string, string> {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (skipDirs.includes(entry.name)) continue
      collectFiles(
        path.join(dir, entry.name),
        relBase ? `${relBase}/${entry.name}` : entry.name,
        skipDirs,
        result,
      )
    } else if (entry.name.endsWith('.d.ts')) {
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name
      result[relPath] = fs.readFileSync(path.join(dir, entry.name), 'utf8')
    }
  }
  return result
}

// Serve all .d.ts files for a whitelisted package as a JSON map { [relPath]: content }.
// Used by the Monaco editor to add @types/node and bun-types as extra libs so that
// IntelliSense works for Node.js and Bun APIs inside function source files.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const { pkg } = req.query
  if (typeof pkg !== 'string' || !Object.hasOwn(PACKAGE_DIRS, pkg)) {
    return res.status(400).json({ error: 'Unknown package. Allowed: node, bun' })
  }

  const pkgDir = PACKAGE_DIRS[pkg]
  if (!fs.existsSync(pkgDir)) {
    return res.status(404).json({ error: 'Package not installed' })
  }

  try {
    const files = collectFiles(pkgDir, '', SKIP_DIRS[pkg] ?? [])
    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.json(files)
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
}
