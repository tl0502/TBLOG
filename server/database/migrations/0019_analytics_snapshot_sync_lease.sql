ALTER TABLE `analytics_snapshot_state` ADD `sync_run_id` text;
--> statement-breakpoint
ALTER TABLE `analytics_snapshot_state` ADD `sync_locked_until` integer;
