import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

describe('theme style scoping', () => {
  it('does not apply scoped descendant effects to the root html element', () => {
    for (const relativePath of [
      '../../../components/site/AmbientBackground.vue',
      '../../../components/site/HeaderParticles.vue',
      '../../../components/site/AppHeader.vue'
    ]) {
      const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')

      expect(source).not.toMatch(/:global\([^)]*\)\s+\./)
    }
  })

  it('synchronizes viewport color scheme and theme-aware scrollbar chrome', () => {
    const appSource = readFileSync(resolve(process.cwd(), 'app.vue'), 'utf8')
    const cssSource = readFileSync(resolve(process.cwd(), 'assets/css/main.css'), 'utf8')

    expect(appSource).toContain("'data-color-mode': preference.value")
    expect(appSource).toContain("'data-theme': resolvedTheme.value")
    expect(appSource).toContain("'data-light-theme': lightTheme.value")
    expect(appSource).toContain("setLightTheme(publicSiteConfig.value?.data.site.lightTheme ?? 'default')")
    expect(cssSource).toMatch(/html\[data-color-mode='dark'\]\s*{\s*color-scheme:\s*dark;/)
    expect(cssSource).toMatch(/html\s*{[^}]*scrollbar-gutter:\s*stable;[^}]*scrollbar-width:\s*thin;/s)
    expect(cssSource).toMatch(/html\[data-theme='atelier'\]\s*{[^}]*--scrollbar-track:[^}]*background:\s*#f1ece4;/s)
    expect(cssSource).toMatch(/html\[data-theme='nocturne'\]\s*{[^}]*--scrollbar-track:\s*#111a1f;[^}]*background:\s*#0e1418;/s)
    expect(cssSource).toMatch(/html::\-webkit-scrollbar\s*{[^}]*width:\s*10px;[^}]*height:\s*10px;/s)
    expect(cssSource).toMatch(/html::\-webkit-scrollbar-thumb\s*{[^}]*background-clip:\s*content-box;/s)
  })

  it('keeps route replacement free of layout-shifting global transitions', () => {
    const nuxtSource = readFileSync(resolve(process.cwd(), 'nuxt.config.ts'), 'utf8')
    const cssSource = readFileSync(resolve(process.cwd(), 'assets/css/main.css'), 'utf8')
    const riseIn = cssSource.match(/@keyframes\s+rise-in\s*{([\s\S]*?)\n}/)?.[1] ?? ''

    expect(nuxtSource).not.toContain('pageTransition')
    expect(cssSource).not.toMatch(/\.page-(?:enter|leave)/)
    expect(riseIn).not.toContain('transform:')
  })
})
