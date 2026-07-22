const IMAGE_TAG_PATTERN = /<img\b[^>]*>/gi

function addAttribute(tag: string, name: string, value: string): string {
  const attributePattern = new RegExp(`\\s${name}\\s*=`, 'i')
  if (attributePattern.test(tag)) return tag
  return tag.replace(/^<img\b/i, `<img ${name}="${value}"`)
}

/**
 * Stored article HTML is sanitized before publication. Add browser loading hints to that safe HTML
 * before SSR emits it so body images are not discovered as eager images and corrected only after
 * hydration. Explicit author/provider attributes remain authoritative.
 */
export function withArticleImageLoadingHints(html: string): string {
  return html.replace(IMAGE_TAG_PATTERN, (tag) => {
    const lazy = addAttribute(tag, 'loading', 'lazy')
    return addAttribute(lazy, 'decoding', 'async')
  })
}
