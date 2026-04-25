import { EventEmitter } from "stream";
import type { BuildData } from '../protocol';
import type {
  Stage,
  BuildStatus,
  BuildContext,
  Pipeline
} from "./types";

export interface PipelineFailureError extends Error {
  stage: string;
  context: BuildContext;
}

export class PipelineRunner extends EventEmitter {
  private readonly pipeline: Pipeline;

  constructor(pipeline: Pipeline) {
    super();
    this.pipeline = pipeline;
  }

  /**
   * Returns the pipeline definition (name, stages with dependencies) without run functions.
   */
  getPipelineDefinition(): { name: string; stages: { name: string; dependsOn: string[] }[] } {
    return {
      name: this.pipeline.name,
      stages: this.pipeline.stages.map((s) => ({
        name: s.name,
        dependsOn: s.dependsOn ?? [],
      })),
    };
  }

  emit<K>(eventName: string | symbol, ...args: any[]): boolean {
    this._throwError(new Error('Cannot emit events from PipelineRunner'));
    return false;
  }

  async run(buildData: BuildData): Promise<void> {
    const stageMap = new Map<string, Stage>(
      this.pipeline.stages.map((s) => [s.name, s]),
    );

    // Validate all declared dependencies exist
    for (const stage of this.pipeline.stages) {
      for (const dep of stage.dependsOn ?? []) {
        if (!stageMap.has(dep)) {
          this._throwError(new Error(`Stage "${stage.name}" depends on unknown stage "${dep}"`));
        }
      }
    }

    // Initialize build status
    const stageStatus: Record<string, BuildStatus> = {};
    for (const stage of this.pipeline.stages) {
      stageStatus[stage.name] = { status: "pending" };
    }

    const context: BuildContext = { ...buildData, stages: stageStatus };

    // Topological sort via Kahn's algorithm — stages with no unmet deps run concurrently
    const inDegree = new Map<string, number>(
      this.pipeline.stages.map((s) => [s.name, 0]),
    );
    const dependents = new Map<string, string[]>(
      this.pipeline.stages.map((s) => [s.name, []]),
    );

    for (const stage of this.pipeline.stages) {
      for (const dep of stage.dependsOn ?? []) {
        inDegree.set(stage.name, inDegree.get(stage.name)! + 1);
        dependents.get(dep)!.push(stage.name);
      }
    }

    let ready = this.pipeline.stages
      .filter((s) => inDegree.get(s.name) === 0)
      .map((s) => s.name);
    let processed = 0;

    while (ready.length > 0) {
      const batch = ready;
      ready = [];

      // Execute all ready stages concurrently; abort on first failure
      await Promise.all(
        batch.map(async (stageName) => {
          const stage = stageMap.get(stageName)!;
          stageStatus[stageName].status = "running";
          super.emit('running', { stage: stageName, context });
          try {
            await stage.run(context);
            stageStatus[stageName].status = "success";
            super.emit('success', { stage: stageName, context });
          } catch (err) {
            stageStatus[stageName].status = "failure";
            stageStatus[stageName].error = err instanceof Error ? err.message : String(err);
            super.emit('failure', { stage: stageName, error: stageStatus[stageName].error, context });
            
            const error = new Error(`Stage "${stageName}" failed: ${stageStatus[stageName].error}`) as PipelineFailureError;
            error.stage = stageName;
            error.context = context;
            this._throwError(error);
          }
        }),
      );

      processed += batch.length;

      // Unlock stages whose dependencies are now all satisfied
      for (const stageName of batch) {
        for (const dependent of dependents.get(stageName)!) {
          const remaining = inDegree.get(dependent)! - 1;
          inDegree.set(dependent, remaining);
          if (remaining === 0) {
            ready.push(dependent);
          }
        }
      }
    }

    if (processed !== this.pipeline.stages.length) {
      this._throwError(new Error(`Cyclic dependency detected in pipeline "${this.pipeline.name}"`));
    }
  }

  private _throwError(error: Error) {
    super.emit('error', error);
    throw error;
  }
}
