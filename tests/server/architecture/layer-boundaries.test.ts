import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const projectRoot = process.cwd()

function sourceFiles(directory: string): string[] {
  return readdirSync(join(projectRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return sourceFiles(path)
    }
    return entry.name.endsWith('.ts') || entry.name.endsWith('.vue') ? [path] : []
  })
}

function expectNoMatch(files: string[], pattern: RegExp) {
  for (const file of files) {
    const source = readFileSync(join(projectRoot, file), 'utf8')
    expect(source, relative(projectRoot, file)).not.toMatch(pattern)
  }
}

describe('server layer boundaries', () => {
  it('keeps controllers independent from repositories and persistence', () => {
    expectNoMatch(
      sourceFiles('server/api'),
      /from ['"][^'"]*(?:repositories\/|database\/|drizzle-orm)/
    )
  })

  it('keeps business services independent from persistence implementation', () => {
    const services = sourceFiles('server/services')
    const businessServices = services.filter((file) => !file.endsWith('-factory.ts'))
    expectNoMatch(services, /from ['"][^'"]*(?:database\/schema|drizzle-orm)/)
    expectNoMatch(businessServices, /from ['"][^'"]*database\//)
    expectNoMatch(
      businessServices,
      /from ['"][^'"]*repositories\/(?!contracts\/)/
    )
  })

  it('keeps repository contracts independent from database schema and Drizzle', () => {
    expectNoMatch(
      sourceFiles('server/repositories/contracts'),
      /from ['"][^'"]*(?:database\/|drizzle-orm)/
    )
  })

  it('keeps client modules independent from server implementation', () => {
    const clientDirectories = ['components', 'composables', 'layouts', 'middleware', 'pages', 'utils']
    const clientFiles = clientDirectories.flatMap(sourceFiles)
    expectNoMatch(clientFiles, /from ['"][^'"]*server\//)
  })
})
