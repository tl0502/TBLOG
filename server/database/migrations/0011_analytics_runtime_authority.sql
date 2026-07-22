-- Copy the legacy analytics selection into the registry without deleting or rewriting the
-- analytics_settings row. Runtime reads use integration_settings after this migration.
INSERT OR IGNORE INTO `integration_settings` (
  `id`, `capability`, `provider_key`, `enabled`, `public_config_json`, `status`,
  `last_checked_at`, `last_error`, `created_at`, `updated_at`
)
SELECT
  lower(hex(randomblob(16))),
  'analytics',
  CASE `provider_key`
    WHEN 'cloudflare' THEN 'cloudflare-web-analytics'
    ELSE `provider_key`
  END,
  `enabled`,
  json_object(
    'scriptUrl', `script_url`,
    'siteId', `site_id`,
    'renderConfig', CASE
      WHEN json_valid(`render_config_json`) THEN json(`render_config_json`)
      ELSE json('{}')
    END
  ),
  CASE WHEN `enabled` THEN 'configured' ELSE 'disabled' END,
  NULL,
  NULL,
  `created_at`,
  `updated_at`
FROM `analytics_settings`
WHERE `provider_key` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `integration_settings` existing
    WHERE existing.`capability` = 'analytics'
  );
