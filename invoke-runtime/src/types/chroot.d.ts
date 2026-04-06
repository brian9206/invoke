declare module 'chroot' {
  /**
   * Change the root directory of the current process.
   * @param newRoot - The new root directory
   * @param user - User name or uid to switch to after chroot
   * @param group - Optional group name or gid to switch to after chroot
   */
  function chroot(newRoot: string, user: string | number, group?: string | number): void;
  export = chroot;
}
