/** Returns true only for a root-relative URL that cannot be interpreted as an authority URL. */
export function isSafeRootRelativeUrl(value: string): boolean {
  return /^\/(?!\/)/.test(value) && !/[\\\u0000-\u001f\u007f]/.test(value)
}

export function isAbsoluteHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)
  } catch { return false }
}

export function isPublicCardUrl(value: string): boolean {
  return isSafeRootRelativeUrl(value) || isAbsoluteHttpUrl(value)
}
