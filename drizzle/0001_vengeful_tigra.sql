CREATE TABLE `diagnosis_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`session_id` text,
	`diagnosis_card_id` text,
	`question_key` text,
	`field_key` text,
	`action` text NOT NULL,
	`actor_type` text NOT NULL,
	`model_provider` text,
	`model_name` text,
	`model_version` text,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `diagnosis_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`diagnosis_card_id`) REFERENCES `diagnosis_cards`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `diagnosis_audit_owner_project_created_idx` ON `diagnosis_audit_events` (`owner_user_id`,`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `diagnosis_field_values` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`session_id` text,
	`diagnosis_card_id` text,
	`field_key` text NOT NULL,
	`label` text NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`source_type` text NOT NULL,
	`source_material_ids_json` text DEFAULT '[]' NOT NULL,
	`source_locations_json` text DEFAULT '[]' NOT NULL,
	`confidence` text DEFAULT 'MEDIUM' NOT NULL,
	`requires_confirmation` integer DEFAULT false NOT NULL,
	`rationale` text DEFAULT '' NOT NULL,
	`confirmed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `diagnosis_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`diagnosis_card_id`) REFERENCES `diagnosis_cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `diagnosis_fields_owner_project_idx` ON `diagnosis_field_values` (`owner_user_id`,`project_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `diagnosis_fields_card_idx` ON `diagnosis_field_values` (`diagnosis_card_id`,`field_key`);--> statement-breakpoint
CREATE TABLE `diagnosis_session_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`session_id` text NOT NULL,
	`question_key` text NOT NULL,
	`position` integer NOT NULL,
	`topic` text NOT NULL,
	`field_key` text NOT NULL,
	`parent_question_key` text,
	`depends_on_answer` text,
	`question` text NOT NULL,
	`why_this_matters` text NOT NULL,
	`decision_impact` text NOT NULL,
	`recommended_answer` text NOT NULL,
	`recommendation_reason` text NOT NULL,
	`options_json` text DEFAULT '[]' NOT NULL,
	`allow_custom_answer` integer DEFAULT true NOT NULL,
	`allow_unknown` integer DEFAULT true NOT NULL,
	`allow_skip` integer DEFAULT true NOT NULL,
	`allow_ai_inference` integer DEFAULT true NOT NULL,
	`blocking_level` text DEFAULT 'NONE' NOT NULL,
	`source_material_ids_json` text DEFAULT '[]' NOT NULL,
	`source_locations_json` text DEFAULT '[]' NOT NULL,
	`answer` text,
	`answer_status` text,
	`answer_source_type` text,
	`confidence` text,
	`asked_at` text,
	`answered_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `diagnosis_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `diagnosis_session_question_uq` ON `diagnosis_session_questions` (`session_id`,`question_key`);--> statement-breakpoint
CREATE INDEX `diagnosis_questions_owner_project_idx` ON `diagnosis_session_questions` (`owner_user_id`,`project_id`,`session_id`);--> statement-breakpoint
CREATE TABLE `diagnosis_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`mode` text NOT NULL,
	`depth` text DEFAULT 'standard' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_question_id` text,
	`answered_count` integer DEFAULT 0 NOT NULL,
	`consecutive_unknown_count` integer DEFAULT 0 NOT NULL,
	`max_questions` integer NOT NULL,
	`stop_reason` text,
	`base_diagnosis_card_id` text,
	`output_diagnosis_card_id` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`base_diagnosis_card_id`) REFERENCES `diagnosis_cards`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`output_diagnosis_card_id`) REFERENCES `diagnosis_cards`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `diagnosis_sessions_owner_project_status_idx` ON `diagnosis_sessions` (`owner_user_id`,`project_id`,`status`);--> statement-breakpoint
CREATE TABLE `diagnosis_task_readiness` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`session_id` text,
	`diagnosis_card_id` text,
	`task_key` text NOT NULL,
	`task_name` text NOT NULL,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`missing_field_keys_json` text DEFAULT '[]' NOT NULL,
	`checked_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `diagnosis_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`diagnosis_card_id`) REFERENCES `diagnosis_cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `diagnosis_readiness_owner_project_idx` ON `diagnosis_task_readiness` (`owner_user_id`,`project_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `diagnosis_readiness_card_idx` ON `diagnosis_task_readiness` (`diagnosis_card_id`,`task_key`);