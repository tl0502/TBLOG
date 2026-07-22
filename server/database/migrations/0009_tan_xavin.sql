CREATE TABLE `analytics_ingest_locks` (
	`key` text PRIMARY KEY NOT NULL,
	`owner_token` text,
	`locked_until` integer NOT NULL
);
