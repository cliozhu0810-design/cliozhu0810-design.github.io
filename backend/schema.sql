CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`vehicle` text NOT NULL,
	`body` text NOT NULL,
	`photos` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`reviewed_at` text,
	`reviewer` text,
	`admin_note` text DEFAULT '' NOT NULL,
	`submission_hash` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comments_facility_status` ON `comments` (`facility_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `comments_review_queue` ON `comments` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `submission_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL
);
