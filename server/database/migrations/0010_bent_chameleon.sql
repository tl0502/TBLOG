CREATE TABLE `search_sync_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_key` text NOT NULL,
	`post_id` text NOT NULL,
	`operation` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`available_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`lease_owner` text,
	`locked_until` integer,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_sync_jobs_provider_post_unique` ON `search_sync_jobs` (`provider_key`,`post_id`);--> statement-breakpoint
CREATE INDEX `search_sync_jobs_claim_idx` ON `search_sync_jobs` (`status`,`available_at`,`locked_until`);--> statement-breakpoint
CREATE INDEX `search_sync_jobs_provider_status_idx` ON `search_sync_jobs` (`provider_key`,`status`);