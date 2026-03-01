const database = require('./database')
const minioService = require('./minio')
const { createResponse } = require('./utils')

/**
 * Delete a function and its associated artifacts (MinIO packages, versions)
 * Returns number of MinIO packages deleted.
 */
async function deleteFunction(functionId) {
  let deletedPackages = 0

  try {
    // Attempt to delete all packages in MinIO for this function
    deletedPackages = await minioService.deleteAllPackagesForFunction(functionId)
  } catch (err) {
    console.error(`deleteFunction: failed to remove MinIO packages for ${functionId}:`, err)
    // continue to delete DB rows even if MinIO cleanup fails
  }

  // Delete function record (cascade deletes versions)
  const { Function: FunctionModel } = database.models;
  const fn = await FunctionModel.findByPk(functionId);

  if (!fn) {
    throw new Error('Function not found')
  }

  await fn.destroy();
  return deletedPackages
}

module.exports = {
  deleteFunction
}
