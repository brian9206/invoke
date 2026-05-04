import { PipelineRunner } from './runner'
import { Pipeline } from './types'

export { PipelineRunner } from './runner'

const pipelines: { [key: string]: () => Promise<Pipeline> } = {
  // register pipeline
  'bun-javascript': () => import('./pipelines/bun-javascript').then(mod => mod.default),
  'bun-typescript': () => import('./pipelines/bun-typescript').then(mod => mod.default)
}

export async function createPipelineRunner(name: string): Promise<PipelineRunner> {
  const pipelineLoader = pipelines[name]

  if (!pipelineLoader) {
    throw new Error(`Unknown pipeline "${name}"`)
  }

  return new PipelineRunner(await pipelineLoader())
}
