CREATE TABLE `experiment_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`experiment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`variant` text NOT NULL,
	`assigned_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `experiment_assignments_experiment_user_uq` ON `experiment_assignments` (`experiment_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `experiment_assignments_user_idx` ON `experiment_assignments` (`user_id`);--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`control_variant` text DEFAULT 'control' NOT NULL,
	`treatment_variant` text DEFAULT 'treatment' NOT NULL,
	`treatment_percentage` integer DEFAULT 50 NOT NULL,
	`updated_by_user_id` text,
	`started_at` text,
	`ended_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `experiments_key_unique` ON `experiments` (`key`);--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`key` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`rollout_percentage` integer DEFAULT 0 NOT NULL,
	`audience_json` text DEFAULT '{}' NOT NULL,
	`updated_by_user_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `operational_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`project_id` text,
	`category` text NOT NULL,
	`event_name` text NOT NULL,
	`success` integer DEFAULT true NOT NULL,
	`duration_ms` integer,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `operational_events_category_time_idx` ON `operational_events` (`category`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `operational_events_actor_time_idx` ON `operational_events` (`actor_user_id`,`occurred_at`);