/**
 * Best-effort removal of `.output` before `nuxt build`.
 *
 * On Windows, Explorer / antivirus / leftover esbuild or wrangler processes often
 * hold handles under `.output/public`, which makes Nitro's recursive rmdir fail with
 * EBUSY. Renaming the directory (or just `public`) frees the path so a fresh tree
 * can be created; trash is deleted with retries and never blocks the build.
 */
import { access, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const outputDir = join(root, '.output')

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function rmWithRetry(path, attempts = 8) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 })
      return true
    } catch (error) {
      lastError = error
      await sleep(150 * (attempt + 1))
    }
  }
  if (lastError) {
    console.warn(
      `[clean-output] could not delete ${path}: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    )
  }
  return false
}

async function moveAside(path, label) {
  if (!(await exists(path))) return true
  const trash = join(root, `.output-trash-${label}-${process.pid}-${Date.now()}`)
  try {
    await rename(path, trash)
  } catch (error) {
    console.warn(
      `[clean-output] rename ${path} failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return rmWithRetry(path)
  }
  // Fire-and-forget trash cleanup so the build path stays free even if delete is slow.
  void rmWithRetry(trash)
  return true
}

if (!(await exists(outputDir))) {
  process.exit(0)
}

// Prefer moving the whole tree; if that is locked, free the hot path Nitro rmdirs first.
const wholeMoved = await moveAside(outputDir, 'all')
if (!wholeMoved) {
  const publicDir = join(outputDir, 'public')
  const serverDir = join(outputDir, 'server')
  await moveAside(publicDir, 'public')
  await moveAside(serverDir, 'server')
  // Remove any leftover empty shells / other children without failing the build.
  try {
    const children = await readdir(outputDir)
    for (const child of children) {
      await moveAside(join(outputDir, child), child.replace(/[^\w.-]+/g, '_'))
    }
  } catch {
    // ignore
  }
  await rmWithRetry(outputDir)
}

console.log('[clean-output] prepared a clean .output path')
// Never fail the build from cleanup alone — Nitro will recreate `.output`.
process.exit(0)
