CREATE TABLE `admin_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`target_user_id` text,
	`project_id` text,
	`action` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `admin_audit_actor_created_idx` ON `admin_audit_logs` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_task_results` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`result_type` text NOT NULL,
	`content_json` text DEFAULT '{}' NOT NULL,
	`warnings_json` text DEFAULT '[]' NOT NULL,
	`missing_inputs_json` text DEFAULT '[]' NOT NULL,
	`created_version_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `ai_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_task_results_owner_task_idx` ON `ai_task_results` (`owner_user_id`,`task_id`);--> statement-breakpoint
CREATE TABLE `ai_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`section_id` text,
	`product_skill` text NOT NULL,
	`task_type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`selected_material_ids_json` text DEFAULT '[]' NOT NULL,
	`model_config_id` text,
	`skill_version_id` text,
	`error_stage` text,
	`error_code` text,
	`error_message` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`skill_version_id`) REFERENCES `skill_versions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_tasks_owner_project_idx` ON `ai_tasks` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `ai_tasks_status_created_idx` ON `ai_tasks` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `citations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`section_version_id` text NOT NULL,
	`literature_id` text NOT NULL,
	`citation_key` text NOT NULL,
	`locator` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`section_version_id`) REFERENCES `section_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`literature_id`) REFERENCES `literature_records`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `citations_owner_version_idx` ON `citations` (`owner_user_id`,`section_version_id`);--> statement-breakpoint
CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`section_version_id` text NOT NULL,
	`text` text NOT NULL,
	`start_offset` integer,
	`end_offset` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`section_version_id`) REFERENCES `section_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `claims_owner_version_idx` ON `claims` (`owner_user_id`,`section_version_id`);--> statement-breakpoint
CREATE TABLE `diagnosis_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`title` text NOT NULL,
	`paper_type` text NOT NULL,
	`language` text NOT NULL,
	`research_object` text DEFAULT '' NOT NULL,
	`research_question` text DEFAULT '' NOT NULL,
	`method` text DEFAULT '' NOT NULL,
	`requirements` text DEFAULT '' NOT NULL,
	`confirmed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `diagnosis_project_version_uq` ON `diagnosis_cards` (`project_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `diagnosis_owner_project_status_idx` ON `diagnosis_cards` (`owner_user_id`,`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `evidence_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`material_id` text NOT NULL,
	`parse_result_id` text,
	`page` integer,
	`paragraph` text,
	`quote` text DEFAULT '' NOT NULL,
	`support_level` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parse_result_id`) REFERENCES `material_parse_results`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_claim_material_locator_uq` ON `evidence_bindings` (`claim_id`,`material_id`,`page`,`paragraph`);--> statement-breakpoint
CREATE INDEX `evidence_owner_project_idx` ON `evidence_bindings` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `export_records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`format` text DEFAULT 'docx' NOT NULL,
	`source_version_ids_json` text DEFAULT '[]' NOT NULL,
	`object_key` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `ai_tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `export_records_owner_project_idx` ON `export_records` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `external_search_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`query_text` text NOT NULL,
	`source_keys_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`searched_at` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `external_search_owner_project_idx` ON `external_search_runs` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `figure_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`figure_version_id` text NOT NULL,
	`format` text NOT NULL,
	`object_key` text,
	`content_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`figure_version_id`) REFERENCES `figure_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `figure_assets_owner_version_idx` ON `figure_assets` (`owner_user_id`,`figure_version_id`);--> statement-breakpoint
CREATE TABLE `figure_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`figure_type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `figure_projects_owner_project_idx` ON `figure_projects` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `figure_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`figure_project_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`source_version_id` text,
	`source_data_ref` text,
	`specification_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`figure_project_id`) REFERENCES `figure_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `figure_versions_project_number_uq` ON `figure_versions` (`figure_project_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `figure_versions_owner_project_idx` ON `figure_versions` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `idea_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`session_id` text NOT NULL,
	`title` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`decision` text DEFAULT 'pending' NOT NULL,
	`decision_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `idea_exploration_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idea_candidates_owner_session_idx` ON `idea_candidates` (`owner_user_id`,`session_id`);--> statement-breakpoint
CREATE TABLE `idea_exploration_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`constraints_json` text DEFAULT '{}' NOT NULL,
	`confirmed_candidate_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idea_sessions_owner_project_idx` ON `idea_exploration_sessions` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `literature_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`search_run_id` text NOT NULL,
	`source_key` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'search_candidate' NOT NULL,
	`imported_literature_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`search_run_id`) REFERENCES `external_search_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`imported_literature_id`) REFERENCES `literature_records`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `literature_candidates_run_external_uq` ON `literature_candidates` (`search_run_id`,`source_key`,`external_id`);--> statement-breakpoint
CREATE INDEX `literature_candidates_owner_project_idx` ON `literature_candidates` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `literature_records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`material_id` text,
	`title` text NOT NULL,
	`authors_json` text DEFAULT '[]' NOT NULL,
	`year` integer,
	`source` text,
	`doi` text,
	`metadata_status` text DEFAULT 'unverified' NOT NULL,
	`full_text_status` text DEFAULT 'unavailable' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `literature_owner_project_idx` ON `literature_records` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `literature_project_doi_uq` ON `literature_records` (`project_id`,`doi`);--> statement-breakpoint
CREATE TABLE `login_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`ip_hash` text,
	`user_agent` text,
	`error_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `login_records_user_created_idx` ON `login_records` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `material_parse_results` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`material_id` text NOT NULL,
	`parser_version` text NOT NULL,
	`content_hash` text NOT NULL,
	`parsed_text_ref` text,
	`page_count` integer,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `material_parse_material_hash_uq` ON `material_parse_results` (`material_id`,`content_hash`);--> statement-breakpoint
CREATE INDEX `material_parse_owner_project_idx` ON `material_parse_results` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `materials` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`object_key` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`error_code` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `materials_owner_project_idx` ON `materials` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `materials_project_status_idx` ON `materials` (`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `outlines` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`diagnosis_card_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`confirmed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`diagnosis_card_id`) REFERENCES `diagnosis_cards`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outlines_project_version_uq` ON `outlines` (`project_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `outlines_owner_project_status_idx` ON `outlines` (`owner_user_id`,`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `presentation_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`presentation_type` text NOT NULL,
	`audience` text DEFAULT '' NOT NULL,
	`duration_minutes` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `presentation_projects_owner_project_idx` ON `presentation_projects` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `presentation_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`presentation_project_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`source_paper_version_ids_json` text DEFAULT '[]' NOT NULL,
	`narrative_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`presentation_project_id`) REFERENCES `presentation_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `presentation_versions_project_number_uq` ON `presentation_versions` (`presentation_project_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `presentation_versions_owner_project_idx` ON `presentation_versions` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `project_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`category` text NOT NULL,
	`content` text NOT NULL,
	`source_material_id` text,
	`is_confirmed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_requirements_owner_project_idx` ON `project_requirements` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`title` text NOT NULL,
	`paper_type` text NOT NULL,
	`language` text NOT NULL,
	`primary_creation_method` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_stage` text DEFAULT 'diagnosis' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `projects_owner_updated_idx` ON `projects` (`owner_user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `projects_owner_status_idx` ON `projects` (`owner_user_id`,`status`);--> statement-breakpoint
CREATE TABLE `response_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`revision_task_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`content` text NOT NULL,
	`user_confirmed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revision_task_id`) REFERENCES `revision_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `response_drafts_task_version_uq` ON `response_drafts` (`revision_task_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `response_drafts_owner_project_idx` ON `response_drafts` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `review_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`review_run_id` text NOT NULL,
	`perspective` text NOT NULL,
	`severity` text NOT NULL,
	`section_id` text,
	`summary` text NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_run_id`) REFERENCES `review_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `review_findings_owner_run_idx` ON `review_findings` (`owner_user_id`,`review_run_id`);--> statement-breakpoint
CREATE TABLE `review_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`scope_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `ai_tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `review_runs_owner_project_idx` ON `review_runs` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `reviewer_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`reviewer_label` text NOT NULL,
	`comment_number` text NOT NULL,
	`content` text NOT NULL,
	`source_material_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_comments_project_number_uq` ON `reviewer_comments` (`project_id`,`reviewer_label`,`comment_number`);--> statement-breakpoint
CREATE INDEX `reviewer_comments_owner_project_idx` ON `reviewer_comments` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `revision_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`reviewer_comment_id` text NOT NULL,
	`section_id` text,
	`base_version_id` text,
	`result_version_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`planned_action` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_comment_id`) REFERENCES `reviewer_comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`base_version_id`) REFERENCES `section_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`result_version_id`) REFERENCES `section_versions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `revision_tasks_owner_project_idx` ON `revision_tasks` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `section_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`section_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`source` text NOT NULL,
	`source_version_id` text,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`created_by_task_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `section_versions_section_number_uq` ON `section_versions` (`section_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `section_versions_section_hash_idx` ON `section_versions` (`section_id`,`content_hash`);--> statement-breakpoint
CREATE INDEX `section_versions_owner_project_idx` ON `section_versions` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `sections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`outline_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`position` integer NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`word_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`outline_id`) REFERENCES `outlines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sections_outline_position_uq` ON `sections` (`outline_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `sections_outline_slug_uq` ON `sections` (`outline_id`,`slug`);--> statement-breakpoint
CREATE INDEX `sections_owner_project_idx` ON `sections` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_uq` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_expires_idx` ON `sessions` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `skill_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`skill_id` text NOT NULL,
	`version` text NOT NULL,
	`source_name` text NOT NULL,
	`source_commit` text,
	`license` text,
	`audit_status` text DEFAULT 'pending' NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_versions_skill_version_uq` ON `skill_versions` (`skill_id`,`version`);--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`product_key` text NOT NULL,
	`display_name` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_product_key_uq` ON `skills` (`product_key`);--> statement-breakpoint
CREATE TABLE `slides` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`presentation_version_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`content_json` text DEFAULT '{}' NOT NULL,
	`speaker_notes` text DEFAULT '' NOT NULL,
	`asset_bindings_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`presentation_version_id`) REFERENCES `presentation_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slides_version_position_uq` ON `slides` (`presentation_version_id`,`position`);--> statement-breakpoint
CREATE INDEX `slides_owner_project_idx` ON `slides` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `submission_preparations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`checklist_json` text DEFAULT '{}' NOT NULL,
	`data_availability_statement` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `submission_owner_project_idx` ON `submission_preparations` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_uq` ON `users` (`phone`);