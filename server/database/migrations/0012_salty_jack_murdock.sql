CREATE TABLE `profile_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`avatar_url` text,
	`short_bio` text NOT NULL,
	`signature` text NOT NULL,
	`introduction` text NOT NULL,
	`topics_json` text,
	`current_status` text NOT NULL,
	`location` text,
	`social_links_json` text,
	`projects_json` text,
	`journey_enabled` integer DEFAULT false NOT NULL,
	`journey_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
