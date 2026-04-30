import stack from '@/config/stack.json'

/**
 * Maps a function's language + runtime to the corresponding build pipeline name.
 * Throws if the combination is unknown, so callers can return a 400.
 */
export function resolveBuildPipeline(language: string, runtime: string): string {
  const entry = (stack.pipelines as Array<{ language: string; runtime: string; pipeline: string }>).find(
    p => p.language === language && p.runtime === runtime
  )
  if (!entry) {
    throw new Error(`No build pipeline available for language "${language}" and runtime "${runtime}"`)
  }
  return entry.pipeline
}
