import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { type Envelope } from '~/composables/usePublicApi'
import type {
  AnalyticsSettings,
  CommentSettings,
  HomeSettings,
  MediaSettings,
  NavigationItem,
  ProfileJourneyEntry,
  ProfileProject,
  ProfileSettings,
  ProfileSocialLink,
  SearchSettings,
  SecuritySettings,
  SeoSettings,
  SettingsByDomain,
  SettingsDomain,
  SiteSettings,
  SocialLink
} from '~/types/settings'

export type {
  AnalyticsSettings,
  CommentSettings,
  HomeSettings,
  MediaSettings,
  NavigationItem,
  ProfileJourneyEntry,
  ProfileProject,
  ProfileSettings,
  ProfileSocialLink,
  SearchSettings,
  SecuritySettings,
  SeoSettings,
  SettingsByDomain,
  SettingsDomain,
  SiteSettings,
  SocialLink
}

/**
 * Pull the human-readable message out of a thrown `$fetch` error.
 *
 * A non-2xx admin API response rejects with a `FetchError` whose `data` holds the
 * parsed `{ error: { code, message, ... } }` envelope. Surfacing that message lets
 * the admin UI show the real reason (slug conflict, invalid slug, processing
 * failure, ...) instead of a generic fallback.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { data?: { error?: { message?: unknown } } } | null | undefined)
    ?.data?.error?.message
  return typeof message === 'string' && message.trim().length > 0 ? message : fallback
}

export interface DashboardMetricsView {
  publishedArticles: number
  drafts: number
  categories: number
  tags: number
  pendingComments: number
}

export function apiErrorCode(error: unknown): string | null {
  const candidate = error as {
    data?: { error?: { code?: unknown } }
    response?: { _data?: { error?: { code?: unknown } } }
  } | null | undefined
  const code = candidate?.data?.error?.code ?? candidate?.response?._data?.error?.code
  return typeof code === 'string' ? code : null
}

export type AnalyticsReportSchedule =
  | 'off'
  | 'hourly'
  | 'every6Hours'
  | 'every12Hours'
  | 'daily'
  | 'weekly'
export type AnalyticsReportWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface AdminAnalyticsReportStatusView {
  enabled: boolean
  schedule: AnalyticsReportSchedule
  timeOfDay: string
  timezone: string
  dayOfWeek: AnalyticsReportWeekday
  activeProvider: string | null
  activeRevision: string | null
  configuredProvider: string | null
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastError: string | null
  syncedThrough: string | null
  syncSupported: boolean
  due: boolean
}

export function useAdminAnalyticsReportStatus() {
  return useFetch<Envelope<AdminAnalyticsReportStatusView>>(
    '/api/v1/admin/analytics/reports/status',
    { key: 'admin-analytics-report-status' }
  )
}

export function updateAdminAnalyticsReportSettings(body: {
  enabled: boolean
  schedule: AnalyticsReportSchedule
  timeOfDay: string
  timezone: string
  dayOfWeek: AnalyticsReportWeekday
}) {
  return $fetch<Envelope<AdminAnalyticsReportStatusView>>(
    '/api/v1/admin/analytics/reports/settings',
    { method: 'PUT', body }
  )
}

export function syncAdminAnalyticsReport() {
  return $fetch<Envelope<AdminAnalyticsReportStatusView>>(
    '/api/v1/admin/analytics/reports/sync',
    { method: 'POST' }
  )
}

export interface AdminLoginInput {
  username: string
  password: string
  secondFactor?: string
}

export interface AdminSecurityOverviewView {
  account: { id: string; username: string }
  twoFactor: { available: boolean; enabled: boolean }
  ipAccess: { currentIp: string | null; allow: string[]; deny: string[] }
}

export interface AdminLoginAttemptView {
  id: string
  adminId: string | null
  username: string
  ipAddress: string
  successful: boolean
  failureReason: string | null
  createdAt: string
}

export interface AdminSetupStatusView {
  required: boolean
}

export interface AdminSetupInput extends AdminLoginInput {}

export interface AdminSessionSnapshot {
  administrator: { username: string }
  permissions: string[]
}

/**
 * Request-scoped during SSR and hydrated on the client by Nuxt. This is only a shell UI snapshot;
 * every admin API remains responsible for authoritative session and permission checks.
 */
export function useAdminSessionSnapshot() {
  return useState<AdminSessionSnapshot | null>('admin-session-snapshot', () => null)
}

export function setAdminSessionSnapshot(snapshot: AdminSessionSnapshot) {
  useAdminSessionSnapshot().value = {
    administrator: { username: snapshot.administrator.username },
    permissions: [...snapshot.permissions]
  }
}

export function clearAdminSessionSnapshot() {
  useAdminSessionSnapshot().value = null
}

/** Dashboard counts. SSR forwards the session cookie on this internal call; the page is gated. */
export function useDashboardMetrics() {
  return useFetch<Envelope<DashboardMetricsView>>('/api/v1/admin/dashboard', {
    key: 'admin-dashboard-metrics'
  })
}

/** Session probe used by the admin auth-gate middleware (forwards the incoming request cookies). */
export function fetchAdminMe() {
  const requestFetch = useRequestFetch()
  return requestFetch<Envelope<AdminSessionSnapshot>>(
    '/api/v1/admin/me'
  )
}

export function adminLogin(input: AdminLoginInput) {
  return $fetch<Envelope<{ admin: { username: string } }>>('/api/v1/admin/sessions', {
    method: 'POST',
    body: input
  })
}

export async function adminLogout() {
  try {
    return await $fetch('/api/v1/admin/sessions/current', { method: 'DELETE' })
  } finally {
    clearAdminSessionSnapshot()
  }
}

export function useAdminSecurity() {
  return useFetch<Envelope<AdminSecurityOverviewView>>('/api/v1/admin/security', {
    key: 'admin-security-overview'
  })
}

export function updateAdminAccount(body: {
  currentPassword: string
  username?: string
  password?: string
}) {
  return $fetch<Envelope<{ administrator: { id: string; username: string } }>>(
    '/api/v1/admin/security/account',
    { method: 'PUT', body }
  )
}

export function startAdminTwoFactor(currentPassword: string) {
  return $fetch<Envelope<{ secret: string; otpauthUri: string }>>(
    '/api/v1/admin/security/two-factor/setup',
    { method: 'POST', body: { currentPassword } }
  )
}

export function enableAdminTwoFactor(code: string) {
  return $fetch<Envelope<{ recoveryCodes: string[] }>>(
    '/api/v1/admin/security/two-factor/enable',
    { method: 'POST', body: { code } }
  )
}

export function disableAdminTwoFactor(body: { currentPassword: string; secondFactor: string }) {
  return $fetch<Envelope<{ disabled: boolean }>>('/api/v1/admin/security/two-factor', {
    method: 'DELETE',
    body
  })
}

export function replaceAdminIpRules(body: { allow: string[]; deny: string[] }) {
  return $fetch<Envelope<{ allow: string[]; deny: string[] }>>('/api/v1/admin/security/ip-rules', {
    method: 'PUT',
    body
  })
}

export function fetchAdminLoginAttempts(offset = 0, limit = 25) {
  return $fetch<Envelope<AdminLoginAttemptView[], { total: number; offset: number; limit: number }>>(
    '/api/v1/admin/security/login-attempts',
    { query: { offset, limit } }
  )
}

export type AdminPostType = 'article' | 'page'
export type AdminPostStatus = 'draft' | 'published'

export interface AdminPostListItemView {
  id: string
  title: string
  slug: string
  type: AdminPostType
  status: AdminPostStatus
  featured: boolean
  featuredOrder?: number
  updatedAt: string
  publishedAt: string | null
  categoryId: string | null
  tagIds: string[]
}

export interface AdminPostEditView extends AdminPostListItemView {
  cover: string | null
  customExcerpt: string | null
  tagIds: string[]
  markdown: string
  processingState: 'pending' | 'processed' | 'failed'
  processingError: string | null
  seoTitle: string | null
  seoDescription: string | null
  canonicalUrlOverride: string | null
  openGraphImageUrl: string | null
  twitterImageUrl: string | null
  jsonLdOverrideJson: string | null
}

export interface AdminTaxonomyOptionView {
  id: string
  name: string
}

export interface AdminTaxonomyOptionsView {
  categories: AdminTaxonomyOptionView[]
  tags: AdminTaxonomyOptionView[]
}

export interface CreatePostBody {
  type: AdminPostType
  title: string
  slug?: string
  categoryId?: string | null
  cover?: string | null
  customExcerpt?: string | null
  tagIds?: string[]
  markdown?: string
  seoTitle?: string | null
  seoDescription?: string | null
  canonicalUrlOverride?: string | null
  openGraphImageUrl?: string | null
  twitterImageUrl?: string | null
  jsonLdOverrideJson?: string | null
}

export interface UpdatePostBody {
  title?: string
  slug?: string
  categoryId?: string | null
  cover?: string | null
  customExcerpt?: string | null
  tagIds?: string[]
  markdown?: string
  status?: AdminPostStatus
  featured?: boolean
  seoTitle?: string | null
  seoDescription?: string | null
  canonicalUrlOverride?: string | null
  openGraphImageUrl?: string | null
  twitterImageUrl?: string | null
  jsonLdOverrideJson?: string | null
}

export function fetchAdminSetupStatus() {
  const requestFetch = useRequestFetch()
  return requestFetch<Envelope<AdminSetupStatusView>>('/api/v1/admin/setup/status')
}

export function setupAdmin(input: AdminSetupInput) {
  return $fetch<Envelope<{ admin: { username: string } }>>('/api/v1/admin/setup', {
    method: 'POST',
    body: input
  })
}

export function applyAdminSetupMigrations() {
  return $fetch<Envelope<AdminMigrationApplyResultView>>('/api/v1/admin/setup/migrations', {
    method: 'POST'
  })
}

/** Admin post list. SSR forwards the session cookie; the page is gated by the admin middleware. */
export function useAdminPosts() {
  return useFetch<Envelope<AdminPostListItemView[]>>('/api/v1/admin/posts')
}

/** Category/tag id-name options for editor metadata controls. */
export function useAdminTaxonomyOptions() {
  return useFetch<Envelope<AdminTaxonomyOptionsView>>('/api/v1/admin/taxonomy-options')
}

export function fetchAdminPost(id: string) {
  return $fetch<Envelope<AdminPostEditView>>(`/api/v1/admin/posts/${id}`)
}

export function createPost(body: CreatePostBody) {
  return $fetch<Envelope<{ id: string; slug: string }>>('/api/v1/admin/posts', {
    method: 'POST',
    body
  })
}

export function updatePost(id: string, body: UpdatePostBody) {
  return $fetch<Envelope<AdminPostEditView>>(`/api/v1/admin/posts/${id}`, {
    method: 'PATCH',
    body
  })
}

export function deletePost(id: string) {
  return $fetch<Envelope<{ id: string }>>(`/api/v1/admin/posts/${id}`, { method: 'DELETE' })
}

/** Render-only Markdown preview via the exact server pipeline; persists nothing. */
export function previewMarkdown(markdown: string) {
  return $fetch<Envelope<{ html: string }>>('/api/v1/admin/posts/preview', {
    method: 'POST',
    body: { markdown }
  })
}

export interface AdminMediaUploadView {
  id: string
  url: string
  contentType: string
  size: number
}

export function uploadMedia(file: File, altText?: string) {
  const body = new FormData()
  body.append('file', file)
  if (altText) body.append('altText', altText)
  return $fetch<Envelope<AdminMediaUploadView>>('/api/v1/admin/media', {
    method: 'POST',
    body
  })
}

export interface AdminCategoryView {
  id: string
  name: string
  slug: string
  description: string | null
  color: string | null
  sortOrder: number
  isSystem: boolean
  articleCount: number
}

export interface AdminTagView {
  id: string
  name: string
  slug: string
  description: string | null
  color: string | null
  sortOrder: number
  articleCount: number
}

export interface CreateCategoryBody {
  name: string
  slug?: string
  description?: string | null
  color?: string | null
  sortOrder?: number
}

export interface UpdateCategoryBody {
  name?: string
  slug?: string
  description?: string | null
  color?: string | null
  sortOrder?: number
}

export type CreateTagBody = CreateCategoryBody
export type UpdateTagBody = UpdateCategoryBody

/** Admin category list with usage counts. SSR forwards the session cookie; the page is gated. */
export function useAdminCategories() {
  return useFetch<Envelope<AdminCategoryView[]>>('/api/v1/admin/categories')
}

/** Admin tag list with usage counts. SSR forwards the session cookie; the page is gated. */
export function useAdminTags() {
  return useFetch<Envelope<AdminTagView[]>>('/api/v1/admin/tags')
}

export function createCategory(body: CreateCategoryBody) {
  return $fetch<Envelope<AdminCategoryView>>('/api/v1/admin/categories', { method: 'POST', body })
}

export function updateCategory(id: string, body: UpdateCategoryBody) {
  return $fetch<Envelope<AdminCategoryView>>(`/api/v1/admin/categories/${id}`, { method: 'PATCH', body })
}

export function deleteCategory(id: string) {
  return $fetch<Envelope<{ id: string }>>(`/api/v1/admin/categories/${id}`, { method: 'DELETE' })
}

export function createTag(body: CreateTagBody) {
  return $fetch<Envelope<AdminTagView>>('/api/v1/admin/tags', { method: 'POST', body })
}

export function updateTag(id: string, body: UpdateTagBody) {
  return $fetch<Envelope<AdminTagView>>(`/api/v1/admin/tags/${id}`, { method: 'PATCH', body })
}

export function deleteTag(id: string) {
  return $fetch<Envelope<{ id: string }>>(`/api/v1/admin/tags/${id}`, { method: 'DELETE' })
}

export function mergeTags(sourceId: string, targetId: string) {
  return $fetch<Envelope<{ sourceId: string; targetId: string }>>('/api/v1/admin/tags/merge', {
    method: 'POST',
    body: { sourceId, targetId }
  })
}

export type AdminCommentStatus = 'pending' | 'approved' | 'rejected'

export interface AdminCommentView {
  id: string
  parentCommentId?: string | null
  parent?: { id: string; nickname: string; content: string; status: AdminCommentStatus } | null
  nickname: string
  email: string | null
  content: string
  status: AdminCommentStatus
  createdAt: string
  reviewedAt: string | null
  post: {
    id: string
    slug: string
    title: string
  }
}

export interface AdminCommentQuery {
  status?: AdminCommentStatus
  offset: number
  limit: number
}

export interface AdminCommentMeta {
  total: number
  offset: number
  limit: number
}

/** Reactive admin moderation list. Query mutations refetch under one deterministic key. */
export function useAdminComments(query: MaybeRefOrGetter<AdminCommentQuery>) {
  return useFetch<Envelope<AdminCommentView[], AdminCommentMeta>>('/api/v1/admin/comments', {
    key: 'admin-comments',
    query: computed(() => toValue(query))
  })
}

export function useAdminCommentCounts() {
  return useFetch<Envelope<{ pending: number }>>('/api/v1/admin/comments/counts', {
    key: 'admin-comment-counts'
  })
}

/** Non-critical sidebar badge read. It starts only when the Admin layout explicitly executes it. */
export function useLazyAdminCommentCounts() {
  return useLazyFetch<Envelope<{ pending: number }>>('/api/v1/admin/comments/counts', {
    key: 'admin-comment-counts',
    server: false,
    immediate: false
  })
}

export function moderateComment(id: string, status: Exclude<AdminCommentStatus, 'pending'>) {
  return $fetch<Envelope<{ id: string; status: Exclude<AdminCommentStatus, 'pending'> }>>(
    `/api/v1/admin/comments/${id}`,
    { method: 'PATCH', body: { status } }
  )
}

export type AdminAutoModerationOutcome =
  | 'approved'
  | 'rejected'
  | 'review_required'
  | 'failed'
  | 'not_found'

export interface AdminAutoModerationResult {
  id: string
  outcome: AdminAutoModerationOutcome
  status: AdminCommentStatus | null
}

export interface AdminAutoModerationResponse {
  results: AdminAutoModerationResult[]
  summary: {
    requested: number
    succeeded: number
    failed: number
  }
}

export function autoModerateComments(ids: string[]) {
  return $fetch<Envelope<AdminAutoModerationResponse>>('/api/v1/admin/comments/auto-moderation', {
    method: 'POST',
    body: { ids }
  })
}

export function deleteComment(id: string) {
  return $fetch<Envelope<{ id: string }>>(`/api/v1/admin/comments/${id}`, {
    method: 'DELETE'
  })
}

export type IntegrationCapability =
  | 'search'
  | 'analytics'
  | 'analyticsReport'
  | 'image'
  | 'storage'
  | 'cache'
  | 'commentProtection'
  | 'commentModeration'
  | 'commentReplica'

export type IntegrationStatus =
  | 'disabled'
  | 'configured'
  | 'active'
  | 'misconfigured'
  | 'unavailable'

export type IntegrationFieldType = 'text' | 'url' | 'password' | 'boolean' | 'select'

export interface IntegrationFieldOption {
  value: string
  label: string
}

export interface IntegrationFieldMeta {
  key: string
  label: string
  type: IntegrationFieldType
  placeholder?: string
  help?: string
  required: boolean
  options?: IntegrationFieldOption[]
  persist?: boolean
  visibleWhen?: { key: string; value: string }
}

export interface IntegrationAction {
  key: string
  label: string
  kind?: 'status' | 'client'
  clientHandler?: 'umamiSelfHostedCredential'
  visibleWhen?: { key: string; value: string }
}

export interface IntegrationView {
  capability: IntegrationCapability
  providerKey: string
  displayName: string
  enabled: boolean
  status: IntegrationStatus
  lastCheckedAt: string | null
  lastError: string | null
  config: Record<string, unknown>
  requiredSecrets: string[]
  requiredBindings: string[]
  missingSecrets: string[]
  missingBindings: string[]
  formMeta: IntegrationFieldMeta[]
  actions: IntegrationAction[]
}

export interface UpdateIntegrationBody {
  enabled: boolean
  config: Record<string, unknown>
}

/** Integration registry with per-provider readiness. SSR forwards the session cookie; the page is gated. */
export function useAdminIntegrations() {
  return useFetch<Envelope<IntegrationView[], { total: number }>>('/api/v1/admin/integrations', {
    key: 'admin-integrations'
  })
}

/**
 * Non-critical integration read for the posts view's search-sync warning. It never blocks first
 * paint: the fetch stays deferred (client-only) until the page explicitly executes it after mount.
 */
export function useLazyAdminIntegrations() {
  return useLazyFetch<Envelope<IntegrationView[], { total: number }>>('/api/v1/admin/integrations', {
    key: 'admin-integrations',
    server: false,
    immediate: false
  })
}

export function updateIntegration(
  capability: string,
  provider: string,
  body: UpdateIntegrationBody
) {
  return $fetch<Envelope<IntegrationView>>(
    `/api/v1/admin/integrations/${capability}/${provider}`,
    { method: 'PUT', body }
  )
}

export function runIntegrationAction(capability: string, provider: string, action: string) {
  return $fetch<Envelope<IntegrationView>>(
    `/api/v1/admin/integrations/${capability}/${provider}/actions/${action}`,
    { method: 'POST' }
  )
}

/**
 * A single Zod validation issue as returned inside `error.details.issues` when the
 * settings PUT rejects with `validation_failed`. Mirrors `ZodIssue` structurally so
 * the admin forms can map messages onto the offending field path.
 */
export interface SettingsValidationIssue {
  path: (string | number)[]
  message: string
  code?: string
}

export interface SettingsDomainMeta<TDomain extends SettingsDomain> {
  domain: TDomain
  revision?: number | null
}

/** Fetch the persisted (or default) configuration object for one settings domain. */
export function fetchSettingsDomain<TDomain extends SettingsDomain>(domain: TDomain) {
  return $fetch<Envelope<SettingsByDomain[TDomain], SettingsDomainMeta<TDomain>>>(
    `/api/v1/admin/settings/${domain}`
  )
}

/** Replace one settings domain wholesale; the server echoes the persisted object. */
export function updateSettingsDomain<TDomain extends SettingsDomain>(
  domain: TDomain,
  body: SettingsByDomain[TDomain],
  options: { revision?: number | null } = {}
) {
  const revision = options.revision
  return $fetch<Envelope<SettingsByDomain[TDomain], SettingsDomainMeta<TDomain>>>(
    `/api/v1/admin/settings/${domain}`,
    {
      method: 'PUT',
      body,
      headers: revision === undefined
        ? undefined
        : { 'x-settings-revision': revision === null ? 'none' : String(revision) }
    }
  )
}

/**
 * Extract field-level validation issues from a thrown settings PUT error. Returns an
 * empty array for any non-`validation_failed` failure so callers can fall back to a
 * generic message.
 */
export function settingsValidationIssues(error: unknown): SettingsValidationIssue[] {
  const envelope = (error as {
    data?: { error?: { code?: string; details?: { issues?: SettingsValidationIssue[] } } }
  } | null | undefined)?.data?.error
  if (envelope?.code === 'validation_failed' && Array.isArray(envelope.details?.issues)) {
    return envelope.details.issues
  }
  return []
}

/**
 * Resolve the first validation message whose issue path begins with `path`. Enables a
 * form field (including nested paths like `['rateLimit','windowSeconds']`) to display
 * its own server-side error.
 */
export function settingsIssueMessage(
  issues: SettingsValidationIssue[],
  path: (string | number)[]
): string {
  const hit = issues.find(
    (issue) => issue.path.length >= path.length && path.every((seg, index) => issue.path[index] === seg)
  )
  return hit?.message ?? ''
}

export interface AdminMigrationStatusView {
  currentVersion: number
  latestVersion: number
  appliedCount: number
  pendingCount: number
  applied: string[]
  pending: string[]
}

export interface AdminMigrationApplyResultView {
  appliedNow: string[]
  failed?: { migrations: string[]; error: string }
  pending: string[]
  currentVersion: number
  latestVersion: number
  durationMs: number
}

/** Migration status for the settings panel. Page is gated by the admin middleware. */
export function useAdminMigrationStatus() {
  return useFetch<Envelope<AdminMigrationStatusView>>('/api/v1/admin/maintenance/db-migrations', {
    key: 'admin-db-migrations'
  })
}

export function applyAdminMigrations() {
  return $fetch<Envelope<AdminMigrationApplyResultView>>('/api/v1/admin/maintenance/db-migrations', {
    method: 'POST'
  })
}
