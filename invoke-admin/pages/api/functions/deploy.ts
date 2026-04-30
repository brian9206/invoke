export const runtime = 'nodejs'

import { NextApiRequest, NextApiResponse } from 'next'
import { AuthenticatedRequest, withAuthOrApiKeyAndMethods } from '@/lib/middleware'
import { checkProjectDeveloperAccess } from '@/lib/project-access'
import multer from 'multer'
import os from 'os'
import fs from 'fs-extra'
import path from 'path'
import crypto from 'crypto'
import * as tar from 'tar'
import { v4 as uuidv4 } from 'uuid'
import AdmZip from 'adm-zip'
import { createResponse } from '@/lib/utils'
import database from '@/lib/database'
import runMiddleware from '@/lib/multer'
import stack from '@/config/stack.json'
import { resolveBuildPipeline } from '@/lib/build-pipeline'

const { s3Service } = require('invoke-shared')

// Configure multer — file is optional (only for upload mode)
const upload = multer({
  dest: path.join(os.tmpdir(), 'uploads'),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedExtensions = ['.zip', '.tar.gz', '.tgz']
    const hasValid = allowedExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext))
    if (hasValid) cb(null, true)
    else cb(new Error('Invalid file type. Only .zip and .tar.gz files are allowed.'))
  }
})

export const config = { api: { bodyParser: false } }

/** Validate that the language + runtime combination is allowed by the config map. */
function isValidCombination(language: string, rt: string): boolean {
  const lang = (stack.languages as Array<{ name: string; runtimes: string[] }>).find(l => l.name === language)
  return lang !== undefined && lang.runtimes.includes(rt)
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  console.log('Guarded handler started, req.body:', req.body)
  const userId = req.user!.id
  let uploadedFile: any = (req as any).file ?? null
  let tempDir: string | null = null

  try {
    // ── Parse form fields ──────────────────────────────────────────────
    const mode: string = req.body.mode // 'template' | 'upload'
    console.log('Mode:', mode)
    const functionName: string = (req.body.name || '').trim()
    const description: string = (req.body.description || '').trim()
    const projectId: string | null = req.body.projectId || null
    const language: string = (req.body.language || '').trim().toLowerCase()
    const rt: string = (req.body.runtime || '').trim().toLowerCase()
    const templatePath: string = (req.body.templatePath || '').trim()

    // ── Validate required fields ───────────────────────────────────────
    console.log('Validating fields...')
    if (!functionName) {
      return res.status(400).json(createResponse(false, null, 'Function name is required', 400))
    }
    if (!mode || !['template', 'upload'].includes(mode)) {
      return res.status(400).json(createResponse(false, null, 'mode must be "template" or "upload"', 400))
    }
    if (!language || !rt) {
      return res.status(400).json(createResponse(false, null, 'language and runtime are required', 400))
    }
    if (!isValidCombination(language, rt)) {
      return res
        .status(400)
        .json(createResponse(false, null, `Invalid language/runtime combination: ${language}/${rt}`, 400))
    }
    if (!projectId) {
      return res.status(400).json(createResponse(false, null, 'projectId is required', 400))
    }
    if (mode === 'template') {
      if (!templatePath) {
        return res.status(400).json(createResponse(false, null, 'templatePath is required for template mode', 400))
      }
      const langEntry = (stack.languages as Array<{ name: string; templates: Array<{ path: string }> }>).find(
        l => l.name === language
      )
      const validTemplate = langEntry?.templates.some(t => t.path === templatePath)
      if (!validTemplate) {
        return res
          .status(400)
          .json(createResponse(false, null, `Invalid template "${templatePath}" for language "${language}"`, 400))
      }
    }
    console.log('Validation passed. User auth check...')

    // ── Auth check ─────────────────────────────────────────────────────
    if (!req.user?.isAdmin) {
      console.log('Checking project developer access...')
      const access = await checkProjectDeveloperAccess(req.user!.id, projectId, false)
      console.log('Access check result:', access)
      if (!access.allowed) {
        return res.status(403).json(createResponse(false, null, access.message || 'Insufficient permissions', 403))
      }
    }

    console.log('Duplicate check...')
    // ── Duplicate check ────────────────────────────────────────────────
    let FunctionModel, FunctionVersion
    try {
      FunctionModel = database.models.Function
      FunctionVersion = database.models.FunctionVersion

      console.log('About to call findOne...')
      const existing = await FunctionModel.findOne({ where: { name: functionName }, attributes: ['id'] })
      console.log('findOne finished, existing:', existing)
      if (existing) {
        return res
          .status(409)
          .json(createResponse(false, null, `Function with name "${functionName}" already exists`, 409))
      }
    } catch (dbError) {
      console.error('Error during duplicate check:', dbError)
      throw dbError
    }

    // ── Prepare S3 service ─────────────────────────────────────────────
    console.log('Checking s3Service...')
    if (!s3Service.initialized) {
      await s3Service.initialize()
    }

    const functionId = uuidv4()
    const version = 1
    const tempBaseDir = process.env.TEMP_DIR || './.cache'
    await fs.ensureDir(tempBaseDir)

    let packagePath: string

    if (mode === 'template') {
      // ── Template mode ──────────────────────────────────────────────
      const templateDir = path.resolve(process.cwd(), '..', 'templates', templatePath)
      if (!(await fs.pathExists(templateDir))) {
        return res.status(400).json(createResponse(false, null, `Template not found: ${templatePath}`, 400))
      }

      tempDir = path.join(tempBaseDir, `deploy-${functionId}`)
      await fs.ensureDir(tempDir)

      // Copy all template files into temp dir
      await fs.copy(templateDir, tempDir)

      // Patch package.json name & description
      const pkgPath = path.join(tempDir, 'package.json')
      if (await fs.pathExists(pkgPath)) {
        const pkg = await fs.readJson(pkgPath)
        pkg.name = functionName
        if (description) pkg.description = description
        await fs.writeJson(pkgPath, pkg, { spaces: 2 })
      }

      // Create .tgz
      const tgzPath = path.join(tempBaseDir, `${functionId}.tgz`)
      const filesToTar = await fs.readdir(tempDir)
      await tar.create({ gzip: true, file: tgzPath, cwd: tempDir }, filesToTar)
      packagePath = tgzPath
    } else {
      // ── Upload mode ────────────────────────────────────────────────
      if (!uploadedFile) {
        return res.status(400).json(createResponse(false, null, 'No file uploaded', 400))
      }

      packagePath = uploadedFile.path
      const originalName = uploadedFile.originalname.toLowerCase()

      // Convert .zip → .tgz
      if (originalName.endsWith('.zip')) {
        const extractDir = path.join(path.dirname(packagePath), `extract_${Date.now()}`)
        const tgzPath = path.join(path.dirname(packagePath), `${functionId}_${version}.tgz`)
        try {
          const zip = new AdmZip(packagePath)
          zip.extractAllTo(extractDir, true)
          await tar.create({ gzip: true, file: tgzPath, cwd: extractDir }, fs.readdirSync(extractDir))
          packagePath = tgzPath
          await fs.remove(extractDir)
        } catch (error) {
          console.error('Error converting zip to tgz:', error)
          throw new Error('Failed to process ZIP file')
        }
      }
    }

    // ── Upload to S3 ───────────────────────────────────────────────────
    const uploadResult = await s3Service.uploadPackage(functionId, version, packagePath)

    // ── Create DB records ──────────────────────────────────────────────
    await FunctionModel.create({
      id: functionId,
      name: functionName,
      description: description || (mode === 'template' ? 'Created from template' : 'Uploaded function package'),
      deployed_by: userId,
      is_active: true,
      project_id: projectId,
      language,
      runtime: rt
    })

    const firstVersion = await FunctionVersion.create({
      function_id: functionId,
      version,
      package_path: uploadResult.objectName,
      file_size: uploadResult.size,
      package_hash: uploadResult.hash,
      created_by: userId
    })

    await FunctionModel.update({ active_version_id: firstVersion.id }, { where: { id: functionId } })

    // Enqueue build
    const { FunctionBuild } = database.models as any
    const pipeline = resolveBuildPipeline(language, rt)
    await FunctionBuild.create({
      function_id: functionId,
      version_id: firstVersion.id,
      status: 'queued',
      after_build_action: 'switch',
      pipeline,
      created_by: userId
    })
    await FunctionVersion.update({ build_status: 'queued' }, { where: { id: firstVersion.id } })

    // ── Cleanup temp files ─────────────────────────────────────────────
    if (tempDir) await fs.remove(tempDir)
    if (mode === 'template') {
      await fs.remove(packagePath)
    } else {
      if (uploadedFile?.path) await fs.remove(uploadedFile.path)
      if (packagePath !== uploadedFile?.path) await fs.remove(packagePath)
    }

    return res
      .status(201)
      .json(
        createResponse(
          true,
          { id: functionId, name: functionName, version, file_size: uploadResult.size },
          'Function deployed successfully',
          201
        )
      )
  } catch (error) {
    console.error('Deploy error:', error)
    if (tempDir) {
      try {
        await fs.remove(tempDir)
      } catch (_) {}
    }
    if (uploadedFile?.path) {
      try {
        await fs.remove(uploadedFile.path)
      } catch (_) {}
    }
    return res.status(500).json(createResponse(false, null, 'Deployment failed. Please try again.', 500))
  }
}

const guarded = withAuthOrApiKeyAndMethods(['POST'])(handler as any)

export default async function adapter(req: NextApiRequest, res: NextApiResponse) {
  console.log('Adapter started, headers:', req.headers)
  try {
    console.log('Running multer middleware...')
    await runMiddleware(upload.single('file'))(req, res)
    console.log('Multer middleware finished successfully. body mode:', req.body?.mode)
  } catch (err: any) {
    console.error('Multer parse error:', err)
    return res.status(400).json(createResponse(false, null, 'Failed to parse form data', 400))
  }
  console.log('Running guarded handler...')
  return await guarded(req as any, res as any)
}
