CREATE TABLE `figure_code_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`figure_project_id` text NOT NULL,
	`language` text DEFAULT 'python' NOT NULL,
	`engine` text DEFAULT 'matplotlib' NOT NULL,
	`code` text NOT NULL,
	`code_hash` text NOT NULL,
	`code_mode` text NOT NULL,
	`parent_version_id` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`figure_project_id`) REFERENCES `figure_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `figure_code_versions_figure_hash_uq` ON `figure_code_versions` (`figure_project_id`,`code_hash`);--> statement-breakpoint
CREATE INDEX `figure_code_versions_owner_project_idx` ON `figure_code_versions` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `figure_data_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`figure_project_id` text NOT NULL,
	`source_type` text NOT NULL,
	`original_filename` text,
	`object_key` text NOT NULL,
	`columns_schema_json` text NOT NULL,
	`row_count` integer NOT NULL,
	`data_hash` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`figure_project_id`) REFERENCES `figure_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `figure_data_snapshots_figure_hash_uq` ON `figure_data_snapshots` (`figure_project_id`,`data_hash`);--> statement-breakpoint
CREATE INDEX `figure_data_snapshots_owner_project_idx` ON `figure_data_snapshots` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `figure_run_records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`figure_project_id` text NOT NULL,
	`figure_version_id` text NOT NULL,
	`data_snapshot_id` text NOT NULL,
	`code_version_id` text NOT NULL,
	`execution_mode` text NOT NULL,
	`runner_id` text NOT NULL,
	`runner_version` text,
	`python_version` text,
	`dependencies_json` text DEFAULT '{}' NOT NULL,
	`dependency_lock_hash` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`queued_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`started_at` text,
	`finished_at` text,
	`timeout_seconds` integer NOT NULL,
	`exit_code` integer,
	`stdout` text,
	`stderr` text,
	`error_type` text,
	`error_message` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`figure_project_id`) REFERENCES `figure_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`figure_version_id`) REFERENCES `figure_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`data_snapshot_id`) REFERENCES `figure_data_snapshots`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`code_version_id`) REFERENCES `figure_code_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `figure_run_records_owner_figure_idx` ON `figure_run_records` (`owner_user_id`,`figure_project_id`);--> statement-breakpoint
CREATE INDEX `figure_run_records_snapshot_code_idx` ON `figure_run_records` (`data_snapshot_id`,`code_version_id`);--> statement-breakpoint
ALTER TABLE `figure_assets` ADD `figure_project_id` text REFERENCES figure_projects(id);--> statement-breakpoint
ALTER TABLE `figure_assets` ADD `run_record_id` text REFERENCES figure_run_records(id);--> statement-breakpoint
ALTER TABLE `figure_assets` ADD `file_size` integer;--> statement-breakpoint
ALTER TABLE `figure_assets` ADD `width` integer;--> statement-breakpoint
ALTER TABLE `figure_assets` ADD `height` integer;--> statement-breakpoint
ALTER TABLE `figure_assets` ADD `dpi` integer;--> statement-breakpoint
CREATE INDEX `figure_assets_run_idx` ON `figure_assets` (`run_record_id`);--> statement-breakpoint
ALTER TABLE `figure_versions` ADD `spec_kind` text DEFAULT 'statistical' NOT NULL;--> statement-breakpoint
ALTER TABLE `figure_versions` ADD `mapping_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `figure_versions` ADD `publication_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `figure_versions` ADD `caption` text;