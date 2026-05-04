import fs from 'fs/promises'
import path from 'path'

async function streamLines(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) return

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line) console.log(line)
    }
  }

  buffer += decoder.decode()
  if (buffer) console.log(buffer)
}

export async function exec(cmds: string[], options?: { cwd?: string; fatal?: boolean }): Promise<number> {
  const fatal = !options || options.fatal === undefined || options.fatal == null ? true : !!options.fatal

  console.log(`Executing: ${cmds.join(' ')}`)

  const proc = Bun.spawn(cmds, { cwd: options?.cwd || '.', stderr: 'pipe', stdout: 'pipe' })

  const [exitCode] = await Promise.all([proc.exited, streamLines(proc.stdout), streamLines(proc.stderr)])

  if (fatal && exitCode !== 0) {
    throw new Error(`Command '${cmds.join(' ')}' failed with exit code ${exitCode}`)
  }

  return exitCode
}

export async function copyRecursive(src: string, dest: string, options?: { exclude?: string[] }): Promise<void> {
  const exclude = options?.exclude || []
  const entries = await fs.readdir(src, { withFileTypes: true })
  await fs.mkdir(dest, { recursive: true })

  for (const entry of entries) {
    if (exclude.includes(entry.name)) continue // skip excluded directories

    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      await copyRecursive(srcPath, destPath, options)
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath)
    }
  }
}
