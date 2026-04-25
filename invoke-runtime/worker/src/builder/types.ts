import type { BuildData } from '../protocol';

export interface Pipeline {
  name: string;
  stages: Stage[];
}

export interface Stage {
  name: string;
  dependsOn?: string[];
  run: (context: BuildContext) => Promise<void>;
}

export interface BuildContext extends BuildData {
  stages: Record<string, BuildStatus>;
}

export interface BuildStatus {
  status: 'pending' | 'running' | 'success' | 'failure';
  result?: unknown;
  error?: string;
}