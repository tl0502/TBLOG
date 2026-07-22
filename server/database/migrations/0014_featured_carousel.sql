ALTER TABLE `posts` ADD `featured_order` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `posts_featured_order_idx` ON `posts` (`is_featured`,`featured_order`);
