import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { baselineSecurityHeaders } from './utils/security-policy'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const appManifestDevPath = resolve(rootDir, '.nuxt/manifest/meta/dev.json')

/**
 * Nuxt maps `#app-manifest` to `.nuxt/manifest/meta/dev.json` after prepare, but Vite can
 * pre-transform `nuxt/dist/app/composables/manifest.js` before that alias is available and log a
 * non-fatal "Failed to resolve import #app-manifest" ERROR. Resolve the id early in dev.
 */
function resolveAppManifestPlugin() {
  const stubId = '\0tblog-app-manifest-stub'
  return {
    name: 'tblog:resolve-app-manifest',
    enforce: 'pre' as const,
    resolveId(id: string) {
      if (id !== '#app-manifest') return null
      if (existsSync(appManifestDevPath)) return appManifestDevPath
      return stubId
    },
    load(id: string) {
      if (id !== stubId) return null
      return 'export default { id: "dev", timestamp: Date.now(), prerendered: [] }\n'
    }
  }
}

export default defineNuxtConfig({
  compatibilityDate: '2026-06-26',
  css: ['~/assets/css/main.css'],
  typescript: {
    strict: true,
    // Keep production builds free of vue-tsc. Run `pnpm typecheck` (CI / pre-push) separately.
    typeCheck: false
  },
  runtimeConfig: {
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    }
  },
  vite: {
    plugins: [resolveAppManifestPlugin()],
    build: {
      // Sourcemaps are expensive on Windows + Cloudflare Worker bundles; enable only when debugging.
      sourcemap: false,
      reportCompressedSize: false
    }
  },
  nitro: {
    preset: 'cloudflare_module',
    sourceMap: false,
    experimental: {
      tasks: true
    },
    scheduledTasks: {
      '*/5 * * * *': ['search:sync'],
      '2-59/5 * * * *': ['analytics:report-sync']
    }
  },
  routeRules: {
    '/**': {
      headers: baselineSecurityHeaders
    },
    '/': {
      headers: {
        'cache-control': 'no-store'
      }
    },
    '/categories/**': {
      headers: {
        'cache-control': 'no-store'
      }
    },
    '/posts/**': {
      headers: {
        'cache-control': 'no-store'
      }
    },
    '/tags/**': {
      headers: {
        'cache-control': 'no-store'
      }
    },
    '/archive': {
      headers: {
        'cache-control': 'no-store'
      }
    },
    '/about': {
      headers: {
        'cache-control': 'no-store'
      }
    },
    '/search': {
      headers: {
        'cache-control': 'no-store'
      }
    },
    '/admin/**': {
      headers: {
        'cache-control': 'no-store'
      }
    },
    '/api/v1/admin/**': {
      headers: {
        'cache-control': 'no-store'
      }
    },
  }
})
