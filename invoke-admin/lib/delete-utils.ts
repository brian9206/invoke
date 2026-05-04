import database from './database'
import { s3Service } from 'invoke-shared'
import { createResponse } from './utils'

// Re-export for convenience
export { createResponse }

/**
 * Delete a function and its associated artifacts (MinIO packages, versions).
 * Returns number of MinIO packages deleted.
 */
async function deleteFunction(functionId: string): Promise<number> {
  let deletedPackages = 0

  try {
    deletedPackages = await s3Service.deleteAllPackagesForFunction(functionId)
  } catch (err) {
    console.error(`deleteFunction: failed to remove S3 packages for ${functionId}:`, err)
    // continue to delete DB rows even if MinIO cleanup fails
  }

  try {
    await s3Service.deleteAllArtifactsForFunction(functionId)
  } catch (err) {
    console.error(`deleteFunction: failed to remove S3 artifacts for ${functionId}:`, err)
    // continue to delete DB rows even if MinIO cleanup fails
  }

  const { Function: FunctionModel } = database.models
  const fn = await FunctionModel.findByPk(functionId)

  if (!fn) {
    throw new Error('Function not found')
  }

  await fn.destroy()
  return deletedPackages
}

export { deleteFunction }
