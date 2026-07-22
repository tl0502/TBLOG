export type ImageVariantName = 'thumbnail' | 'medium' | 'large'

export interface PublicImageTemplates {
  thumbnail: string | null
  medium: string | null
  large: string | null
}

const variantWidths: Record<ImageVariantName, number> = {
  thumbnail: 480,
  medium: 960,
  large: 1440
}

export function expandImageTemplate(
  template: string | null | undefined,
  sourceUrl: string,
  options: { width?: number; height?: number } = {}
): string {
  if (!template) return sourceUrl
  return template
    .replaceAll('{url}', encodeURIComponent(sourceUrl))
    .replaceAll('{width}', String(options.width ?? ''))
    .replaceAll('{height}', String(options.height ?? ''))
}

export function imageVariantUrl(
  templates: PublicImageTemplates | null | undefined,
  variant: ImageVariantName,
  sourceUrl: string
): string {
  return expandImageTemplate(templates?.[variant], sourceUrl, { width: variantWidths[variant] })
}

export function imageVariantSrcset(
  templates: PublicImageTemplates | null | undefined,
  sourceUrl: string
): string | null {
  if (!templates) return null
  const entries = (Object.keys(variantWidths) as ImageVariantName[])
    .filter((variant) => Boolean(templates[variant]))
    .map((variant) => `${imageVariantUrl(templates, variant, sourceUrl)} ${variantWidths[variant]}w`)
  return entries.length > 0 ? entries.join(', ') : null
}
