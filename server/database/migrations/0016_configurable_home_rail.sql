CREATE TABLE `home_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`rail_cards_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
