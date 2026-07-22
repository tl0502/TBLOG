CREATE TABLE `analytics_conversion_daily` (
	`day` text NOT NULL,
	`conversion` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `conversion`)
);
--> statement-breakpoint
CREATE TABLE `analytics_daily_metrics` (
	`day` text PRIMARY KEY NOT NULL,
	`page_views` integer DEFAULT 0 NOT NULL,
	`visits` integer DEFAULT 0 NOT NULL,
	`new_visitors` integer DEFAULT 0 NOT NULL,
	`returning_visitors` integer DEFAULT 0 NOT NULL,
	`outbound_clicks` integer DEFAULT 0 NOT NULL,
	`searches` integer DEFAULT 0 NOT NULL,
	`no_result_searches` integer DEFAULT 0 NOT NULL,
	`comment_form_views` integer DEFAULT 0 NOT NULL,
	`comment_submissions` integer DEFAULT 0 NOT NULL,
	`not_found_views` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `analytics_dimension_daily` (
	`day` text NOT NULL,
	`dimension` text NOT NULL,
	`value` text NOT NULL,
	`page_views` integer DEFAULT 0 NOT NULL,
	`visits` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `dimension`, `value`)
);
--> statement-breakpoint
CREATE TABLE `analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_hash` text NOT NULL,
	`session_hash` text NOT NULL,
	`type` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`day` text NOT NULL,
	`path` text,
	`referrer_host` text,
	`utm_source` text,
	`utm_medium` text,
	`utm_campaign` text,
	`country` text,
	`device` text,
	`browser` text,
	`os` text,
	`reading_depth` integer,
	`search_query` text,
	`result_count` integer,
	`outbound_host` text,
	`status_code` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analytics_events_expires_at_idx` ON `analytics_events` (`expires_at`);--> statement-breakpoint
CREATE INDEX `analytics_events_day_type_idx` ON `analytics_events` (`day`,`type`);--> statement-breakpoint
CREATE TABLE `analytics_page_daily` (
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
	PRIMARY KEY(`day`, `path`)
);
--> statement-breakpoint
CREATE INDEX `analytics_page_daily_day_idx` ON `analytics_page_daily` (`day`);--> statement-breakpoint
CREATE TABLE `analytics_referrer_daily` (
	`day` text NOT NULL,
	`referrer_host` text NOT NULL,
	`visits` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `referrer_host`)
);
--> statement-breakpoint
CREATE TABLE `analytics_search_daily` (
	`day` text NOT NULL,
	`query` text NOT NULL,
	`searches` integer DEFAULT 0 NOT NULL,
	`no_result_searches` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `query`)
);
--> statement-breakpoint
CREATE TABLE `analytics_sessions` (
	`session_hash` text PRIMARY KEY NOT NULL,
	`visitor_hash` text NOT NULL,
	`started_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`entry_path` text,
	`exit_path` text,
	`page_views` integer DEFAULT 0 NOT NULL,
	`referrer_host` text,
	`utm_source` text,
	`utm_medium` text,
	`utm_campaign` text,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analytics_sessions_visitor_hash_idx` ON `analytics_sessions` (`visitor_hash`);--> statement-breakpoint
CREATE INDEX `analytics_sessions_expires_at_idx` ON `analytics_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `analytics_visitor_days` (
	`day` text NOT NULL,
	`visitor_hash` text NOT NULL,
	`first_session_hash` text NOT NULL,
	`is_new_visitor` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`day`, `visitor_hash`)
);
--> statement-breakpoint
CREATE INDEX `analytics_visitor_days_day_idx` ON `analytics_visitor_days` (`day`);--> statement-breakpoint
CREATE TABLE `analytics_visitors` (
	`visitor_hash` text PRIMARY KEY NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analytics_visitors_expires_at_idx` ON `analytics_visitors` (`expires_at`);