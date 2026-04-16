export function setupSleepGlobal(): void {
  (globalThis as any).sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
}