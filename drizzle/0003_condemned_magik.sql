CREATE TABLE `analysis_fidelity_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`processing_copy_id` text NOT NULL,
	`check_type` text NOT NULL,
	`status` text NOT NULL,
	`detail` text NOT NULL,
	`blocking` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`processing_copy_id`) REFERENCES `material_processing_copies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_fidelity_copy_type_uq` ON `analysis_fidelity_checks` (`processing_copy_id`,`check_type`);--> statement-breakpoint
CREATE INDEX `analysis_fidelity_owner_project_idx` ON `analysis_fidelity_checks` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `material_privacy_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`material_id` text NOT NULL,
	`direct_identifiers_json` text DEFAULT '[]' NOT NULL,
	`indirect_identifiers_json` text DEFAULT '[]' NOT NULL,
	`sensitive_attributes_json` text DEFAULT '[]' NOT NULL,
	`research_necessary_variables_json` text DEFAULT '[]' NOT NULL,
	`ordinary_research_content_json` text DEFAULT '[]' NOT NULL,
	`confidentiality_restrictions_json` text DEFAULT '[]' NOT NULL,
	`copyright_restrictions_json` text DEFAULT '[]' NOT NULL,
	`recommended_mode` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`confirmed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `material_privacy_profile_material_uq` ON `material_privacy_profiles` (`material_id`);--> statement-breakpoint
CREATE INDEX `material_privacy_profile_owner_project_idx` ON `material_privacy_profiles` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `material_processing_copies` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`material_id` text NOT NULL,
	`privacy_profile_id` text NOT NULL,
	`mode` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`storage_reference` text,
	`content_hash` text,
	`transformation_summary_json` text DEFAULT '[]' NOT NULL,
	`fidelity_status` text NOT NULL,
	`approved_by_user` integer DEFAULT false NOT NULL,
	`created_by_task_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`privacy_profile_id`) REFERENCES `material_privacy_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_task_id`) REFERENCES `ai_tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `material_processing_copy_owner_material_idx` ON `material_processing_copies` (`owner_user_id`,`material_id`);--> statement-breakpoint
CREATE TABLE `pseudonymization_maps` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`processing_copy_id` text NOT NULL,
	`secret_reference` text NOT NULL,
	`mapping_count` integer NOT NULL,
	`reversible` integer DEFAULT true NOT NULL,
	`access_scope` text DEFAULT 'OWNER_ONLY' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`processing_copy_id`) REFERENCES `material_processing_copies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pseudonymization_map_copy_uq` ON `pseudonymization_maps` (`processing_copy_id`);--> statement-breakpoint
CREATE INDEX `pseudonymization_map_owner_project_idx` ON `pseudonymization_maps` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `task_material_transmissions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`material_id` text NOT NULL,
	`processing_copy_id` text NOT NULL,
	`provider_key` text NOT NULL,
	`purpose` text NOT NULL,
	`status` text NOT NULL,
	`block_reason` text,
	`transmitted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `ai_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`processing_copy_id`) REFERENCES `material_processing_copies`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `task_material_transmission_owner_task_idx` ON `task_material_transmissions` (`owner_user_id`,`task_id`);