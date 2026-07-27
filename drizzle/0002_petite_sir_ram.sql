CREATE TABLE `ai_task_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`actor_type` text NOT NULL,
	`reason` text,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `ai_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_task_events_owner_task_created_idx` ON `ai_task_events` (`owner_user_id`,`task_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_task_model_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`role` text NOT NULL,
	`provider_key` text NOT NULL,
	`model_key` text NOT NULL,
	`model_version` text NOT NULL,
	`skill_key` text NOT NULL,
	`skill_version` text NOT NULL,
	`model_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `ai_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_task_model_assignment_role_uq` ON `ai_task_model_assignments` (`task_id`,`role`);--> statement-breakpoint
CREATE INDEX `ai_task_model_assignment_owner_project_idx` ON `ai_task_model_assignments` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `review_issue_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`report_id` text NOT NULL,
	`issue_id` text,
	`decision` text NOT NULL,
	`reason` text,
	`resolved_version_id` text,
	`decided_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`report_id`) REFERENCES `review_reports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issue_id`) REFERENCES `review_issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_version_id`) REFERENCES `section_versions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `review_decisions_owner_report_idx` ON `review_issue_decisions` (`owner_user_id`,`report_id`);--> statement-breakpoint
CREATE TABLE `review_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`report_id` text NOT NULL,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`suggestion` text NOT NULL,
	`model_sources_json` text DEFAULT '[]' NOT NULL,
	`evidence_binding_ids_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`report_id`) REFERENCES `review_reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_issues_owner_report_idx` ON `review_issues` (`owner_user_id`,`report_id`);--> statement-breakpoint
CREATE TABLE `review_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`reviewed_version_id` text NOT NULL,
	`conclusion` text NOT NULL,
	`summary` text NOT NULL,
	`high_count` integer DEFAULT 0 NOT NULL,
	`medium_count` integer DEFAULT 0 NOT NULL,
	`low_count` integer DEFAULT 0 NOT NULL,
	`context_snapshot_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `ai_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_version_id`) REFERENCES `section_versions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_reports_task_uq` ON `review_reports` (`task_id`);--> statement-breakpoint
CREATE INDEX `review_reports_owner_project_idx` ON `review_reports` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `section_version_adoptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`section_id` text NOT NULL,
	`version_id` text NOT NULL,
	`source_task_id` text,
	`candidate_type` text NOT NULL,
	`adopted` integer DEFAULT false NOT NULL,
	`adopted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `section_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_task_id`) REFERENCES `ai_tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `section_version_adoption_version_uq` ON `section_version_adoptions` (`version_id`);--> statement-breakpoint
CREATE INDEX `section_version_adoption_owner_section_idx` ON `section_version_adoptions` (`owner_user_id`,`section_id`);--> statement-breakpoint
ALTER TABLE `ai_tasks` ADD `parent_task_id` text;--> statement-breakpoint
ALTER TABLE `ai_tasks` ADD `task_role` text;--> statement-breakpoint
ALTER TABLE `ai_tasks` ADD `review_mode` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_tasks` ADD `idempotency_key` text;--> statement-breakpoint
ALTER TABLE `ai_tasks` ADD `execution_profile_id` text;--> statement-breakpoint
ALTER TABLE `ai_tasks` ADD `reviewed_version_id` text REFERENCES section_versions(id);--> statement-breakpoint
ALTER TABLE `ai_tasks` ADD `result_version_id` text REFERENCES section_versions(id);--> statement-breakpoint
ALTER TABLE `ai_tasks` ADD `max_calls` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_tasks` ADD `calls_used` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_tasks` ADD `timeout_seconds` integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_tasks` ADD `stop_reason` text;--> statement-breakpoint
CREATE INDEX `ai_tasks_parent_idx` ON `ai_tasks` (`parent_task_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_tasks_owner_project_idempotency_uq` ON `ai_tasks` (`owner_user_id`,`project_id`,`idempotency_key`);