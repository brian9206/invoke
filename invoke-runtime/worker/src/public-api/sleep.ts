declare global {
  /**
   * Pause execution for the given duration.
   * @param ms Milliseconds to wait.
   * @returns A promise that resolves after the delay elapses.
   */
  function sleep(ms: number): Promise<void>
}

/** @internal */
export function setupSleepGlobal(): void {
  globalThis.sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
}
