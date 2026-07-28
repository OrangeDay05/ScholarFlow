CREATE TABLE `material_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`material_id` text NOT NULL,
	`parse_run_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`text` text NOT NULL,
	`location_json` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parse_run_id`) REFERENCES `material_parse_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `material_chunks_run_ordinal_uq` ON `material_chunks` (`parse_run_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `material_chunks_owner_project_material_idx` ON `material_chunks` (`owner_user_id`,`project_id`,`material_id`);--> statement-breakpoint
CREATE TABLE `material_parse_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`material_id` text NOT NULL,
	`material_object_id` text NOT NULL,
	`parser_key` text NOT NULL,
	`parser_version` text NOT NULL,
	`format` text NOT NULL,
	`content_hash` text NOT NULL,
	`status` text DEFAULT 'RUNNING' NOT NULL,
	`idempotency_key` text NOT NULL,
	`record_count` integer DEFAULT 0 NOT NULL,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`error_message` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_object_id`) REFERENCES `material_objects`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `material_parse_runs_owner_project_idempotency_uq` ON `material_parse_runs` (`owner_user_id`,`project_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `material_parse_runs_material_created_idx` ON `material_parse_runs` (`material_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `material_parse_runs_owner_project_status_idx` ON `material_parse_runs` (`owner_user_id`,`project_id`,`status`);