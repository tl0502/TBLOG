export function publicErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const value = error as Record<string, unknown>
  const nested = value.data && typeof value.data === 'object' ? value.data as Record<string, unknown> : null
  const status = value.statusCode ?? value.status ?? nested?.statusCode
  return typeof status === 'number' ? status : null
}

export function isPublicNotFoundError(error: unknown): boolean {
  const status = publicErrorStatus(error)
  return status === 404 || status === 410
}
