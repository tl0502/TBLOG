import 'h3'

declare module 'h3' {
  interface H3EventContext {
    cloudflare?: {
      env?: Partial<CloudflareBindings> & Record<string, unknown>
      context?: ExecutionContext
    }
  }
}

export {}
