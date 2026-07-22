CREATE TABLE `analytics_snapshot_article_projection` (
	`batch_id` text NOT NULL,
	`provider` text NOT NULL,
	`path` text NOT NULL,
	`page_views` integer DEFAULT 0 NOT NULL,
	`current_page_views` integer DEFAULT 0 NOT NULL,
	`previous_page_views` integer DEFAULT 0 NOT NULL,
	`last_7_days_views` integer DEFAULT 0 NOT NULL,
	`last_activity_day` text,
	`current_rank` integer,
	`historical_rank` integer,
	PRIMARY KEY(`batch_id`, `path`)
);
--> statement-breakpoint
CREATE INDEX `analytics_snapshot_article_projection_current_rank_idx` ON `analytics_snapshot_article_projection` (`batch_id`,`current_rank`);--> statement-breakpoint
CREATE INDEX `analytics_snapshot_article_projection_historical_rank_idx` ON `analytics_snapshot_article_projection` (`batch_id`,`historical_rank`);--> statement-breakpoint
CREATE INDEX `analytics_snapshot_article_projection_path_idx` ON `analytics_snapshot_article_projection` (`batch_id`,`path`);--> statement-breakpoint
CREATE TABLE `analytics_snapshot_projection_manifest` (
	`batch_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`synced_through` text,
	`current_from` text,
	`previous_from` text,
	`historical_from` text,
	`published_article_page_views` integer DEFAULT 0 NOT NULL,
	`expected_chunks` integer DEFAULT 0 NOT NULL,
	`completed_chunks` integer DEFAULT 0 NOT NULL,
	`complete` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analytics_snapshot_projection_manifest_complete_idx` ON `analytics_snapshot_projection_manifest` (`complete`);