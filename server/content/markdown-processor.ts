import GithubSlugger from 'github-slugger'
import { toString } from 'mdast-util-to-string'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import type { CodeBlockMeta } from './code-meta'
import { parseCodeFenceMeta } from './code-meta'

export const contentProcessorVersion = 'content-pipeline-v1'

export interface TocItem {
  id: string
  depth: 2 | 3
  text: string
}

export interface ProcessedMarkdown {
  html: string
  toc: TocItem[]
  excerpt: string
  readingTime: number
  plainTextSearchBody: string
  codeMeta: CodeBlockMeta[]
  processorVersion: string
}

type VisitTree = Parameters<typeof visit>[0]

interface MarkdownNode {
  type: string
  children?: MarkdownNode[]
  data?: {
    hProperties?: Record<string, unknown>
  }
}

interface HeadingNode extends MarkdownNode {
  depth: number
}

interface CodeNode extends MarkdownNode {
  lang?: string | null
  meta?: string | null
}

const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  clobberPrefix: '',
  attributes: {
    ...defaultSchema.attributes,
    h2: [
      ...(defaultSchema.attributes?.h2 ?? []),
      'id'
    ],
    h3: [
      ...(defaultSchema.attributes?.h3 ?? []),
      'id'
    ],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ['className', /^language-/, 'hljs']
    ],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ['className', /^hljs-/]
    ],
    pre: [
      ...(defaultSchema.attributes?.pre ?? []),
      ['className', /^language-/, 'hljs']
    ]
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function createExcerpt(value: string, maxLength = 160): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength).trimEnd()}...`
}

function calculateReadingTime(value: string): number {
  if (!value) {
    return 0
  }

  const words = value.split(/\s+/).filter(Boolean)
  return Math.max(1, Math.ceil(words.length / 200))
}

function getPlainText(tree: MarkdownNode): string {
  const parts = (tree.children ?? [])
    .filter((child) => child.type !== 'html')
    .map((child) => toString(child))
    .filter(Boolean)

  return normalizeText(parts.join(' '))
}

export async function processMarkdown(markdown: string): Promise<ProcessedMarkdown> {
  if (!markdown.trim()) {
    return {
      html: '',
      toc: [],
      excerpt: '',
      readingTime: 0,
      plainTextSearchBody: '',
      codeMeta: [],
      processorVersion: contentProcessorVersion
    }
  }

  const toc: TocItem[] = []
  const codeMeta: CodeBlockMeta[] = []
  let plainTextSearchBody = ''

  function collectMarkdownMetadata() {
    return (tree: MarkdownNode) => {
      const slugger = new GithubSlugger()
      plainTextSearchBody = getPlainText(tree)

      visit(tree as VisitTree, 'heading', (node) => {
        const heading = node as HeadingNode

        if (heading.depth !== 2 && heading.depth !== 3) {
          return
        }

        const text = normalizeText(toString(heading))
        if (!text) {
          return
        }

        const id = slugger.slug(text)
        heading.data = heading.data ?? {}
        heading.data.hProperties = {
          ...(heading.data.hProperties ?? {}),
          id
        }
        toc.push({ id, depth: heading.depth, text })
      })

      visit(tree as VisitTree, 'code', (node) => {
        const code = node as CodeNode
        const language = code.lang ?? ''
        const meta = code.meta ? ` ${code.meta}` : ''
        codeMeta.push(parseCodeFenceMeta(`${language}${meta}`, codeMeta.length))
      })
    }
  }

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(collectMarkdownMetadata)
    .use(remarkRehype)
    .use(rehypeHighlight)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify)
    .process(markdown)

  return {
    html: String(file),
    toc,
    excerpt: createExcerpt(plainTextSearchBody),
    readingTime: calculateReadingTime(plainTextSearchBody),
    plainTextSearchBody,
    codeMeta,
    processorVersion: contentProcessorVersion
  }
}
