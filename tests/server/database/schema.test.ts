import { getTableName } from 'drizzle-orm'
import {
  administratorIpRules,
  administratorLoginAttempts,
  administratorRecoveryCodes,
  administratorSecurity,
  administrators,
  analyticsReportState,
  categories,
  commentSettings,
  comments,
  integrationSettings,
  homeSettings,
  mediaReferences,
  mediaSettings,
  postContent,
  postMetadata,
  postTags,
  posts,
  profileSettings,
  searchSettings,
  securitySettings,
  seoSettings,
  sessions,
  siteSettings,
  tags
} from '../../../server/database/schema'
import { postStatusValues, postTypeValues } from '../../../server/domain/post'

describe('database schema', () => {
  it('defines the version one durable tables', () => {
    const tableNames = [
      administrators,
      sessions,
      administratorSecurity,
      administratorRecoveryCodes,
      administratorIpRules,
      administratorLoginAttempts,
      categories,
      tags,
      posts,
      postContent,
      postMetadata,
      postTags,
      comments,
      mediaReferences,
      siteSettings,
      homeSettings,
      profileSettings,
      searchSettings,
      analyticsReportState,
      commentSettings,
      mediaSettings,
      securitySettings,
      seoSettings,
      integrationSettings
    ].map((table) => getTableName(table))

    expect(tableNames).toEqual([
      'administrators',
      'sessions',
      'administrator_security',
      'administrator_recovery_codes',
      'administrator_ip_rules',
      'administrator_login_attempts',
      'categories',
      'tags',
      'posts',
      'post_content',
      'post_metadata',
      'post_tags',
      'comments',
      'media_references',
      'site_settings',
      'home_settings',
      'profile_settings',
      'search_settings',
      'analytics_report_state',
      'comment_settings',
      'media_settings',
      'security_settings',
      'seo_settings',
      'integration_settings'
    ])
  })

  it('keeps public post type and status values explicit', () => {
    expect(postTypeValues).toEqual(['article', 'page'])
    expect(postStatusValues).toEqual(['draft', 'published'])
  })
})
