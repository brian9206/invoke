import { PipelineRunner } from './runner'
import { Pipeline } from './types'

export { PipelineRunner } from './runner'

const pipelines: { [key: string]: () => Promise<Pipeline> } = {
  // register pipeline
  bun: () => import('./pipelines/bun').then(mod => mod.default)
}

export async function createPipelineRunner(name: string): Promise<PipelineRunner> {
  const pipelineLoader = pipelines[name]

  if (!pipelineLoader) {
    throw new Error(`Unknown pipeline "${name}"`)
  }

  return new PipelineRunner(await pipelineLoader())
}
