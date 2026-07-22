CREATE TABLE `analytics_snapshot_daily_metrics` (
	`batch_id` text NOT NULL,
	`provider` text NOT NULL,
	`day` text NOT NULL,
	`page_views` integer DEFAULT 0 NOT NULL,
	`unique_visitors` integer DEFAULT 0 NOT NULL,
	`visits` integer DEFAULT 0 NOT NULL,
	`new_visitors` integer DEFAULT 0 NOT NULL,
	`returning_visitors` integer DEFAULT 0 NOT NULL,
	`outbound_clicks` integer DEFAULT 0 NOT NULL,
	`searches` integer DEFAULT 0 NOT NULL,
	`no_result_searches` integer DEFAULT 0 NOT NULL,
	`comment_form_views` integer DEFAULT 0 NOT NULL,
	`comment_submissions` integer DEFAULT 0 NOT NULL,
	`not_found_views` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`batch_id`, `day`)
);
--> statement-breakpoint
CREATE INDEX `analytics_snapshot_daily_metrics_provider_day_idx` ON `analytics_snapshot_daily_metrics` (`provider`,`day`);--> statement-breakpoint
CREATE INDEX `analytics_snapshot_daily_metrics_batch_day_idx` ON `analytics_snapshot_daily_metrics` (`batch_id`,`day`);--> statement-breakpoint
CREATE TABLE `analytics_snapshot_dimension_daily` (
	`batch_id` text NOT NULL,
	`provider` text NOT NULL,
	`day` text NOT NULL,
	`dimension` text NOT NULL,
	`value` text NOT NULL,
	`page_views` integer DEFAULT 0 NOT NULL,
	`visits` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`batch_id`, `day`, `dimension`, `value`)
);
--> statement-breakpoint
CREATE TABLE `analytics_snapshot_page_daily` (
	`batch_id` text NOT NULL,
	`provider` text NOT NULL,
	`day` text NOT NULL,
	`path` text NOT NULL,
	`page_views` integer DEFAULT 0 NOT NULL,
	`entries` integer DEFAULT 0 NOT NULL,
	`exits` integer DEFAULT 0 NOT NULL,
	`depth_25` integer DEFAULT 0 NOT NULL,
	`depth_50` integer DEFAULT 0 NOT NULL,
	`depth_75` integer DEFAULT 0 NOT NULL,
	`depth_100` integer DEFAULT 0 NOT NULL,
	`not_found_views` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`batch_id`, `day`, `path`)
);
--> statement-breakpoint
CREATE INDEX `analytics_snapshot_page_provider_day_idx` ON `analytics_snapshot_page_daily` (`provider`,`day`);--> statement-breakpoint
CREATE INDEX `analytics_snapshot_page_provider_path_day_idx` ON `analytics_snapshot_page_daily` (`provider`,`path`,`day`);--> statement-breakpoint
CREATE INDEX `analytics_snapshot_page_batch_path_day_idx` ON `analytics_snapshot_page_daily` (`batch_id`,`path`,`day`);--> statement-breakpoint
CREATE TABLE `analytics_snapshot_referrer_daily` (
	`batch_id` text NOT NULL,
	`provider` text NOT NULL,
	`day` text NOT NULL,
	`referrer_host` text NOT NULL,
	`visits` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`batch_id`, `day`, `referrer_host`)
);
--> statement-breakpoint
CREATE TABLE `analytics_snapshot_search_daily` (
	`batch_id` text NOT NULL,
	`provider` text NOT NULL,
	`day` text NOT NULL,
	`query` text NOT NULL,
	`searches` integer DEFAULT 0 NOT NULL,
	`no_result_searches` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`batch_id`, `day`, `query`)
);
--> statement-breakpoint
CREATE TABLE `analytics_snapshot_state` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`schedule` text DEFAULT 'off' NOT NULL,
	`active_provider` text,
	`active_batch_id` text,
	`last_attempt_at` integer,
	`last_success_at` integer,
	`last_failure_at` integer,
	`last_error` text,
	`synced_through` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
