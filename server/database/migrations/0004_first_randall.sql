ALTER TABLE `posts` ADD `is_featured` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `posts_is_featured_idx` ON `posts` (`is_featured`);