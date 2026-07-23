import { relations, sql } from 'drizzle-orm'
import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core'
import { commentStatusValues, type CommentStatus } from '../domain/comment'
import {
  adminIpRuleTypeValues,
  loginFailureReasonValues,
  type AdminIpRuleType,
  type LoginFailureReason
} from '../domain/admin-security'
import { processingStateValues, type ProcessingState } from '../domain/content'
import { integrationStatusValues, type IntegrationStatus } from '../domain/integration'
import { postStatusValues, postTypeValues } from '../domain/post'
import {
  searchSyncJobStatusValues,
  searchSyncOperationValues,
  type SearchSyncJobStatus,
  type SearchSyncOperation
} from '../domain/search-sync'
import { siteLightThemeValues } from '../../types/settings'

export {
  adminIpRuleTypeValues,
  commentStatusValues,
  loginFailureReasonValues,
  processingStateValues,
  integrationStatusValues,
  searchSyncJobStatusValues,
  searchSyncOperationValues
}
export type {
  AdminIpRuleType,
  CommentStatus,
  LoginFailureReason,
  ProcessingState,
  IntegrationStatus,
  SearchSyncJobStatus,
  SearchSyncOperation
}

const timestampMs = (name: string) => integer(name, { mode: 'timestamp_ms' })
const createdAt = () => timestampMs('created_at').notNull().default(sql`(unixepoch() * 1000)`)
const updatedAt = () => timestampMs('updated_at').notNull().default(sql`(unixepoch() * 1000)`)
const booleanInt = (name: string) => integer(name, { mode: 'boolean' })

export const administrators = sqliteTable(
  'administrators',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    uniqueIndex('administrators_username_unique').on(table.username)
  ]
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    adminId: text('admin_id').notNull().references(() => administrators.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestampMs('expires_at').notNull(),
    createdAt: createdAt()
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_admin_id_idx').on(table.adminId),
    index('sessions_expires_at_idx').on(table.expiresAt)
  ]
)

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    isSystem: booleanInt('is_system').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    uniqueIndex('categories_slug_unique').on(table.slug),
    index('categories_sort_order_idx').on(table.sortOrder)
  ]
)

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    uniqueIndex('tags_slug_unique').on(table.slug),
    index('tags_sort_order_idx').on(table.sortOrder)
  ]
)

export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    type: text('type', { enum: postTypeValues }).notNull(),
    status: text('status', { enum: postStatusValues }).notNull().default('draft'),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    authorId: text('author_id').notNull().references(() => administrators.id, { onDelete: 'restrict' }),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    cover: text('cover'),
    isFeatured: booleanInt('is_featured').notNull().default(false),
    featuredOrder: integer('featured_order').notNull().default(0),
    publishedAt: timestampMs('published_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    uniqueIndex('posts_slug_unique').on(table.slug),
    index('posts_status_idx').on(table.status),
    index('posts_type_idx').on(table.type),
    index('posts_is_featured_idx').on(table.isFeatured),
    index('posts_featured_order_idx').on(table.isFeatured, table.featuredOrder),
    index('posts_published_at_idx').on(table.publishedAt),
    index('posts_public_published_at_idx').on(table.status, table.type, table.publishedAt),
    index('posts_public_updated_at_idx').on(table.status, table.type, table.updatedAt),
    index('posts_category_id_idx').on(table.categoryId)
  ]
)

export const postContent = sqliteTable('post_content', {
  postId: text('post_id').primaryKey().references(() => posts.id, { onDelete: 'cascade' }),
  markdown: text('markdown').notNull().default(''),
  html: text('html'),
  tocJson: text('toc_json'),
  customExcerpt: text('custom_excerpt'),
  excerpt: text('excerpt'),
  readingTime: integer('reading_time').notNull().default(0),
  plainTextSearchBody: text('plain_text_search_body'),
  codeMetaJson: text('code_meta_json'),
  processorVersion: text('processor_version'),
  processingState: text('processing_state', { enum: processingStateValues }).notNull().default('pending'),
  processingError: text('processing_error'),
  processedAt: timestampMs('processed_at')
})

export const postMetadata = sqliteTable('post_metadata', {
  postId: text('post_id').primaryKey().references(() => posts.id, { onDelete: 'cascade' }),
  seoTitle: text('seo_title'),
  seoDescription: text('seo_description'),
  canonicalUrlOverride: text('canonical_url_override'),
  openGraphImageUrl: text('open_graph_image_url'),
  twitterImageUrl: text('twitter_image_url'),
  jsonLdOverrideJson: text('json_ld_override_json')
})

export const postTags = sqliteTable(
  'post_tags',
  {
    postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
    tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' })
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.tagId], name: 'post_tags_post_id_tag_id_pk' }),
    index('post_tags_post_id_idx').on(table.postId),
    index('post_tags_tag_id_idx').on(table.tagId)
  ]
)

export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey(),
    postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
    nickname: text('nickname').notNull(),
    email: text('email'),
    content: text('content').notNull(),
    parentCommentId: text('parent_comment_id').references((): AnySQLiteColumn => comments.id, { onDelete: 'cascade' }),
    replyToNickname: text('reply_to_nickname'),
    status: text('status', { enum: commentStatusValues }).notNull().default('pending'),
    createdAt: createdAt(),
    reviewedAt: timestampMs('reviewed_at')
  },
  (table) => [
    index('comments_post_id_idx').on(table.postId),
    index('comments_parent_comment_id_idx').on(table.parentCommentId),
    index('comments_status_idx').on(table.status),
    index('comments_public_top_level_idx').on(
      table.postId,
      table.status,
      table.parentCommentId,
      table.createdAt,
      table.id
    ),
    index('comments_public_replies_idx').on(
      table.parentCommentId,
      table.status,
      table.createdAt,
      table.id
    )
  ]
)

export const mediaReferences = sqliteTable(
  'media_references',
  {
    id: text('id').primaryKey(),
    url: text('url').notNull(),
    altText: text('alt_text'),
    width: integer('width'),
    height: integer('height'),
    caption: text('caption'),
    providerKey: text('provider_key'),
    referenceState: text('reference_state').notNull().default('external'),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    index('media_references_provider_key_idx').on(table.providerKey)
  ]
)

export const siteSettings = sqliteTable('site_settings', {
  id: text('id').primaryKey(),
  siteName: text('site_name').notNull(),
  description: text('description'),
  logoUrl: text('logo_url'),
  faviconUrl: text('favicon_url'),
  featuredFallbackCover: text('featured_fallback_cover'),
  lightTheme: text('light_theme', { enum: siteLightThemeValues }).notNull().default('default'),
  navigationJson: text('navigation_json'),
  locale: text('locale').notNull().default('zh-CN'),
  timezone: text('timezone').notNull().default('Asia/Shanghai'),
  socialLinksJson: text('social_links_json'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const homeSettings = sqliteTable('home_settings', {
  id: text('id').primaryKey(),
  railCardsJson: text('rail_cards_json'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

/** Public author profile content; list fields stay JSON to preserve the singleton domain boundary. */
export const profileSettings = sqliteTable('profile_settings', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  avatarUrl: text('avatar_url'),
  shortBio: text('short_bio').notNull(),
  signature: text('signature').notNull(),
  introduction: text('introduction').notNull(),
  topicsJson: text('topics_json'),
  currentStatus: text('current_status').notNull(),
  location: text('location'),
  socialLinksJson: text('social_links_json'),
  projectsJson: text('projects_json'),
  journeyEnabled: booleanInt('journey_enabled').notNull().default(false),
  journeyJson: text('journey_json'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const searchSettings = sqliteTable('search_settings', {
  id: text('id').primaryKey(),
  enabled: booleanInt('enabled').notNull().default(false),
  providerKey: text('provider_key'),
  publicConfigJson: text('public_config_json'),
  indexingStatus: text('indexing_status'),
  lastIndexedAt: timestampMs('last_indexed_at'),
  lastError: text('last_error'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

/** Schedule, lease, operational metadata, and one bounded current published report snapshot. */
export const analyticsReportState = sqliteTable('analytics_report_state', {
  id: text('id').primaryKey(),
  enabled: booleanInt('enabled').notNull().default(false),
  schedule: text('schedule').notNull().default('off'),
  timeOfDay: text('time_of_day').notNull().default('03:00'),
  timezone: text('timezone').notNull().default('UTC'),
  dayOfWeek: text('day_of_week').notNull().default('mon'),
  activeProvider: text('active_provider'),
  configFingerprint: text('config_fingerprint'),
  activeRevision: text('active_revision'),
  sourceGeneratedAt: timestampMs('source_generated_at'),
  publishedAt: timestampMs('published_at'),
  syncedThrough: text('synced_through'),
  reportJson: text('report_json'),
  lastAttemptAt: timestampMs('last_attempt_at'),
  lastSuccessAt: timestampMs('last_success_at'),
  lastFailureAt: timestampMs('last_failure_at'),
  lastError: text('last_error'),
  syncRunId: text('sync_run_id'),
  syncLockedUntil: timestampMs('sync_locked_until'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const administratorSecurity = sqliteTable('administrator_security', {
  adminId: text('admin_id')
    .primaryKey()
    .references(() => administrators.id, { onDelete: 'cascade' }),
  twoFactorSecretCiphertext: text('two_factor_secret_ciphertext'),
  twoFactorSecretIv: text('two_factor_secret_iv'),
  twoFactorEnabledAt: timestampMs('two_factor_enabled_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const administratorRecoveryCodes = sqliteTable(
  'administrator_recovery_codes',
  {
    id: text('id').primaryKey(),
    adminId: text('admin_id').notNull().references(() => administrators.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    createdAt: createdAt()
  },
  (table) => [
    uniqueIndex('administrator_recovery_codes_hash_unique').on(table.codeHash),
    index('administrator_recovery_codes_admin_id_idx').on(table.adminId)
  ]
)

export const administratorIpRules = sqliteTable(
  'administrator_ip_rules',
  {
    id: text('id').primaryKey(),
    type: text('type', { enum: adminIpRuleTypeValues }).notNull(),
    ipAddress: text('ip_address').notNull(),
    createdByAdminId: text('created_by_admin_id')
      .notNull()
      .references(() => administrators.id, { onDelete: 'cascade' }),
    createdAt: createdAt()
  },
  (table) => [
    uniqueIndex('administrator_ip_rules_type_ip_unique').on(table.type, table.ipAddress),
    index('administrator_ip_rules_type_idx').on(table.type)
  ]
)

export const administratorLoginAttempts = sqliteTable(
  'administrator_login_attempts',
  {
    id: text('id').primaryKey(),
    adminId: text('admin_id').references(() => administrators.id, { onDelete: 'set null' }),
    username: text('username').notNull(),
    ipAddress: text('ip_address').notNull(),
    successful: booleanInt('successful').notNull(),
    failureReason: text('failure_reason', { enum: loginFailureReasonValues }),
    createdAt: createdAt()
  },
  (table) => [
    index('administrator_login_attempts_created_at_idx').on(table.createdAt),
    index('administrator_login_attempts_ip_created_at_idx').on(table.ipAddress, table.createdAt),
    index('administrator_login_attempts_username_created_at_idx').on(table.username, table.createdAt),
    index('administrator_login_attempts_admin_created_at_idx').on(table.adminId, table.createdAt)
  ]
)

export const commentModerationResults = sqliteTable(
  'comment_moderation_results',
  {
    commentId: text('comment_id').primaryKey().references(() => comments.id, { onDelete: 'cascade' }),
    providerKey: text('provider_key').notNull(),
    decision: text('decision').notNull(),
    confidence: integer('confidence_millis'),
    categoriesJson: text('categories_json'),
    reasonsJson: text('reasons_json'),
    providerRequestId: text('provider_request_id'),
    modelVersion: text('model_version'),
    createdAt: createdAt(),
    expiresAt: timestampMs('expires_at').notNull()
  },
  (table) => [
    index('comment_moderation_results_expires_at_idx').on(table.expiresAt),
    index('comment_moderation_results_decision_idx').on(table.decision)
  ]
)

export const commentReplicaJobs = sqliteTable(
  'comment_replica_jobs',
  {
    id: text('id').primaryKey(),
    providerKey: text('provider_key').notNull(),
    commentId: text('comment_id').notNull(),
    operation: text('operation', { enum: ['upsert', 'remove'] }).notNull(),
    payloadJson: text('payload_json').notNull(),
    revision: integer('revision').notNull().default(1),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    uniqueIndex('comment_replica_jobs_provider_comment_uidx').on(table.providerKey, table.commentId),
    index('comment_replica_jobs_updated_at_idx').on(table.updatedAt)
  ]
)

export const commentSettings = sqliteTable('comment_settings', {
  id: text('id').primaryKey(),
  enabled: booleanInt('enabled').notNull().default(true),
  moderateByDefault: booleanInt('moderate_by_default').notNull().default(true),
  autoModerationEnabled: booleanInt('auto_moderation_enabled').notNull().default(false),
  turnstileSiteKey: text('turnstile_site_key'),
  rateLimitConfigJson: text('rate_limit_config_json'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const mediaSettings = sqliteTable('media_settings', {
  id: text('id').primaryKey(),
  externalUrlMode: booleanInt('external_url_mode').notNull().default(true),
  imageProviderKey: text('image_provider_key'),
  urlTemplatesJson: text('url_templates_json'),
  storageProviderStatus: text('storage_provider_status'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const securitySettings = sqliteTable('security_settings', {
  id: text('id').primaryKey(),
  sessionTtlSeconds: integer('session_ttl_seconds').notNull().default(604800),
  setupLocked: booleanInt('setup_locked').notNull().default(false),
  allowedOriginsJson: text('allowed_origins_json'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const seoSettings = sqliteTable('seo_settings', {
  id: text('id').primaryKey(),
  defaultTitle: text('default_title'),
  defaultDescription: text('default_description'),
  canonicalBaseUrl: text('canonical_base_url'),
  rssEnabled: booleanInt('rss_enabled').notNull().default(true),
  sitemapEnabled: booleanInt('sitemap_enabled').notNull().default(true),
  robotsPolicy: text('robots_policy').notNull().default('index,follow'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
})

export const integrationSettings = sqliteTable(
  'integration_settings',
  {
    id: text('id').primaryKey(),
    capability: text('capability').notNull(),
    providerKey: text('provider_key').notNull(),
    enabled: booleanInt('enabled').notNull().default(false),
    publicConfigJson: text('public_config_json'),
    status: text('status', { enum: integrationStatusValues }).notNull().default('disabled'),
    lastCheckedAt: timestampMs('last_checked_at'),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    uniqueIndex('integration_settings_capability_provider_unique').on(table.capability, table.providerKey),
    index('integration_settings_capability_idx').on(table.capability),
    index('integration_settings_provider_key_idx').on(table.providerKey)
  ]
)

export const searchSyncJobs = sqliteTable(
  'search_sync_jobs',
  {
    id: text('id').primaryKey(),
    providerKey: text('provider_key').notNull(),
    postId: text('post_id').notNull(),
    operation: text('operation', { enum: searchSyncOperationValues }).notNull(),
    status: text('status', { enum: searchSyncJobStatusValues }).notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    revision: integer('revision').notNull().default(1),
    availableAt: timestampMs('available_at').notNull().default(sql`(unixepoch() * 1000)`),
    leaseOwner: text('lease_owner'),
    lockedUntil: timestampMs('locked_until'),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    uniqueIndex('search_sync_jobs_provider_post_unique').on(table.providerKey, table.postId),
    index('search_sync_jobs_claim_idx').on(table.status, table.availableAt, table.lockedUntil),
    index('search_sync_jobs_provider_status_idx').on(table.providerKey, table.status)
  ]
)

export const administratorRelations = relations(administrators, ({ many }) => ({
  sessions: many(sessions),
  recoveryCodes: many(administratorRecoveryCodes),
  ipRules: many(administratorIpRules),
  loginAttempts: many(administratorLoginAttempts),
  posts: many(posts)
}))

export const sessionRelations = relations(sessions, ({ one }) => ({
  administrator: one(administrators, {
    fields: [sessions.adminId],
    references: [administrators.id]
  })
}))

export const categoryRelations = relations(categories, ({ many }) => ({
  posts: many(posts)
}))

export const postRelations = relations(posts, ({ one, many }) => ({
  author: one(administrators, {
    fields: [posts.authorId],
    references: [administrators.id]
  }),
  category: one(categories, {
    fields: [posts.categoryId],
    references: [categories.id]
  }),
  content: one(postContent),
  metadata: one(postMetadata),
  tags: many(postTags),
  comments: many(comments)
}))

export const postContentRelations = relations(postContent, ({ one }) => ({
  post: one(posts, {
    fields: [postContent.postId],
    references: [posts.id]
  })
}))

export const postMetadataRelations = relations(postMetadata, ({ one }) => ({
  post: one(posts, {
    fields: [postMetadata.postId],
    references: [posts.id]
  })
}))

export const tagRelations = relations(tags, ({ many }) => ({
  posts: many(postTags)
}))

export const postTagRelations = relations(postTags, ({ one }) => ({
  post: one(posts, {
    fields: [postTags.postId],
    references: [posts.id]
  }),
  tag: one(tags, {
    fields: [postTags.tagId],
    references: [tags.id]
  })
}))

export const commentRelations = relations(comments, ({ one }) => ({
  post: one(posts, {
    fields: [comments.postId],
    references: [posts.id]
  })
}))

export type Administrator = typeof administrators.$inferSelect
export type NewAdministrator = typeof administrators.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type AdministratorSecurity = typeof administratorSecurity.$inferSelect
export type NewAdministratorSecurity = typeof administratorSecurity.$inferInsert
export type AdministratorRecoveryCode = typeof administratorRecoveryCodes.$inferSelect
export type NewAdministratorRecoveryCode = typeof administratorRecoveryCodes.$inferInsert
export type AdministratorIpRule = typeof administratorIpRules.$inferSelect
export type NewAdministratorIpRule = typeof administratorIpRules.$inferInsert
export type AdministratorLoginAttempt = typeof administratorLoginAttempts.$inferSelect
export type NewAdministratorLoginAttempt = typeof administratorLoginAttempts.$inferInsert
export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
export type Tag = typeof tags.$inferSelect
export type NewTag = typeof tags.$inferInsert
export type Post = typeof posts.$inferSelect
export type NewPost = typeof posts.$inferInsert
export type PostContent = typeof postContent.$inferSelect
export type NewPostContent = typeof postContent.$inferInsert
export type PostMetadata = typeof postMetadata.$inferSelect
export type NewPostMetadata = typeof postMetadata.$inferInsert
export type Comment = typeof comments.$inferSelect
export type NewComment = typeof comments.$inferInsert
export type MediaReference = typeof mediaReferences.$inferSelect
export type NewMediaReference = typeof mediaReferences.$inferInsert
export type IntegrationSetting = typeof integrationSettings.$inferSelect
export type NewIntegrationSetting = typeof integrationSettings.$inferInsert
