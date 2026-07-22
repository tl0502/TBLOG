CREATE INDEX `posts_public_published_at_idx` ON `posts` (`status`,`type`,`published_at`);
--> statement-breakpoint
CREATE INDEX `posts_public_updated_at_idx` ON `posts` (`status`,`type`,`updated_at`);
