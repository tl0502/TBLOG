CREATE TABLE `comment_moderation_results` (
	`comment_id` text PRIMARY KEY NOT NULL,
	`provider_key` text NOT NULL,
	`decision` text NOT NULL,
	`confidence_millis` integer,
	`categories_json` text,
	`reasons_json` text,
	`provider_request_id` text,
	`model_version` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comment_moderation_results_expires_at_idx` ON `comment_moderation_results` (`expires_at`);--> statement-breakpoint
CREATE INDEX `comment_moderation_results_decision_idx` ON `comment_moderation_results` (`decision`);