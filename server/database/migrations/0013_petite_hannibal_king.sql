CREATE TABLE `administrator_ip_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`ip_address` text NOT NULL,
	`created_by_admin_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by_admin_id`) REFERENCES `administrators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `administrator_ip_rules_type_ip_unique` ON `administrator_ip_rules` (`type`,`ip_address`);--> statement-breakpoint
CREATE INDEX `administrator_ip_rules_type_idx` ON `administrator_ip_rules` (`type`);--> statement-breakpoint
CREATE TABLE `administrator_login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text,
	`username` text NOT NULL,
	`ip_address` text NOT NULL,
	`successful` integer NOT NULL,
	`failure_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `administrators`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `administrator_login_attempts_created_at_idx` ON `administrator_login_attempts` (`created_at`);--> statement-breakpoint
CREATE INDEX `administrator_login_attempts_ip_created_at_idx` ON `administrator_login_attempts` (`ip_address`,`created_at`);--> statement-breakpoint
CREATE INDEX `administrator_login_attempts_admin_created_at_idx` ON `administrator_login_attempts` (`admin_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `administrator_recovery_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `administrators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `administrator_recovery_codes_hash_unique` ON `administrator_recovery_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `administrator_recovery_codes_admin_id_idx` ON `administrator_recovery_codes` (`admin_id`);--> statement-breakpoint
CREATE TABLE `administrator_security` (
	`admin_id` text PRIMARY KEY NOT NULL,
	`two_factor_secret_ciphertext` text,
	`two_factor_secret_iv` text,
	`two_factor_enabled_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `administrators`(`id`) ON UPDATE no action ON DELETE cascade
);
