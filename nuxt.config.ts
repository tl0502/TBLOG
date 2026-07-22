import { baselineSecurityHeaders } from './utils/security-policy'

export default defineNuxtConfig({
  compatibilityDate: '2026-06-26',
  css: ['~/assets/css/main.css'],
  typescript: {
    strict: true,
    typeCheck: true
  },
  runtimeConfig: {
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    }
  },
  nitro: {
    preset: 'cloudflare_module',
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
