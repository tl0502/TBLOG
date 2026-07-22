ALTER TABLE `comments` ADD `parent_comment_id` text REFERENCES `comments`(`id`) ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX `comments_parent_comment_id_idx` ON `comments` (`parent_comment_id`);
--> statement-breakpoint
CREATE TABLE `comment_replica_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_key` text NOT NULL,
	`comment_id` text NOT NULL,
	`operation` text NOT NULL,
	`payload_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comment_replica_jobs_provider_comment_uidx` ON `comment_replica_jobs` (`provider_key`,`comment_id`);
--> statement-breakpoint
CREATE INDEX `comment_replica_jobs_updated_at_idx` ON `comment_replica_jobs` (`updated_at`);
