DELETE FROM `integration_settings`
WHERE `capability` = 'analytics'
  AND `provider_key` IN ('native', 'tblog-public-analytics');--> statement-breakpoint
DROP TABLE `analytics_snapshot_projection_manifest`;--> statement-breakpoint
DROP TABLE `analytics_snapshot_article_projection`;--> statement-breakpoint
DROP TABLE `analytics_snapshot_search_daily`;--> statement-breakpoint
DROP TABLE `analytics_snapshot_dimension_daily`;--> statement-breakpoint
DROP TABLE `analytics_snapshot_referrer_daily`;--> statement-breakpoint
DROP TABLE `analytics_snapshot_page_daily`;--> statement-breakpoint
DROP TABLE `analytics_snapshot_daily_metrics`;--> statement-breakpoint
DROP TABLE `analytics_snapshot_state`;--> statement-breakpoint
DROP TABLE `analytics_conversion_daily`;--> statement-breakpoint
DROP TABLE `analytics_search_daily`;--> statement-breakpoint
DROP TABLE `analytics_dimension_daily`;--> statement-breakpoint
DROP TABLE `analytics_referrer_daily`;--> statement-breakpoint
DROP TABLE `analytics_page_daily`;--> statement-breakpoint
DROP TABLE `analytics_daily_metrics`;--> statement-breakpoint
DROP TABLE `analytics_visitor_days`;--> statement-breakpoint
DROP TABLE `analytics_sessions`;--> statement-breakpoint
DROP TABLE `analytics_visitors`;--> statement-breakpoint
DROP TABLE `analytics_events`;--> statement-breakpoint
DROP TABLE `analytics_ingest_locks`;--> statement-breakpoint
DROP TABLE `analytics_settings`;
