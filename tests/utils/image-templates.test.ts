import { imageVariantSrcset, imageVariantUrl } from '../../utils/image-templates'

describe('image URL templates', () => {
  const templates = {
    thumbnail: 'https://img.example/thumb?w={width}&src={url}',
    medium: 'https://img.example/medium?w={width}&src={url}',
    large: 'https://img.example/large?w={width}&src={url}'
  }

  it('expands source and dimension placeholders for a named variant', () => {
    expect(imageVariantUrl(templates, 'medium', 'https://origin.example/a.jpg')).toBe(
      'https://img.example/medium?w=960&src=https%3A%2F%2Forigin.example%2Fa.jpg'
    )
  })

  it('percent-encodes signed, Unicode, and comma-containing source URLs as one provider value', () => {
    const source = 'https://origin.example/图片,a.jpg?token=a&fit=cover'

    const result = imageVariantUrl(templates, 'large', source)

    expect(result).toBe(`https://img.example/large?w=1440&src=${encodeURIComponent(source)}`)
    expect(result).not.toContain('&fit=cover')
    expect(result).not.toContain(',')
  })

  it('builds a responsive srcset and falls back to the source without templates', () => {
    expect(imageVariantSrcset(templates, 'https://origin.example/a.jpg')).toContain('480w')
    expect(imageVariantSrcset(templates, 'https://origin.example/a.jpg')).toContain('1440w')
    expect(imageVariantUrl(null, 'large', 'https://origin.example/a.jpg')).toBe(
      'https://origin.example/a.jpg'
    )
  })

  it('keeps each encoded signed URL intact inside srcset entries', () => {
    const source = 'https://origin.example/a,b.jpg?signature=x&expires=1'
    const srcset = imageVariantSrcset(templates, source)

    expect(srcset?.split(', ')).toHaveLength(3)
    expect(srcset).toContain(encodeURIComponent(source))
  })
})
