CREATE TABLE `credential_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text,
	`provider_id` text NOT NULL,
	`credential_type` text NOT NULL,
	`label` text NOT NULL,
	`masked_key` text NOT NULL,
	`secret_reference` text,
	`allowed_model_ids_json` text DEFAULT '[]' NOT NULL,
	`allowed_project_ids_json` text DEFAULT '[]' NOT NULL,
	`allowed_roles_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'NOT_CONFIGURED' NOT NULL,
	`last_test_status` text DEFAULT 'NOT_TESTED' NOT NULL,
	`disabled_at` text,
	`deleted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_id`) REFERENCES `model_providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `credential_metadata_owner_provider_idx` ON `credential_metadata` (`owner_user_id`,`provider_id`);--> statement-breakpoint
CREATE TABLE `execution_profile_models` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_profile_id` text NOT NULL,
	`provider_model_id` text NOT NULL,
	`credential_metadata_id` text,
	`role` text NOT NULL,
	`priority` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`execution_profile_id`) REFERENCES `execution_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_model_id`) REFERENCES `provider_models`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`credential_metadata_id`) REFERENCES `credential_metadata`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `execution_profile_model_role_uq` ON `execution_profile_models` (`execution_profile_id`,`role`);--> statement-breakpoint
CREATE TABLE `execution_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text,
	`project_id` text,
	`name` text NOT NULL,
	`mode` text NOT NULL,
	`max_models` integer NOT NULL,
	`max_calls` integer NOT NULL,
	`timeout_seconds` integer NOT NULL,
	`fallback_plan` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `execution_profiles_owner_project_idx` ON `execution_profiles` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `model_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_key` text NOT NULL,
	`display_name` text NOT NULL,
	`data_processor_name` text NOT NULL,
	`status` text DEFAULT 'MOCK_ONLY' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_providers_key_uq` ON `model_providers` (`provider_key`);--> statement-breakpoint
CREATE TABLE `provider_models` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model_key` text NOT NULL,
	`display_name` text NOT NULL,
	`model_version` text NOT NULL,
	`allowed_roles_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'MOCK_ONLY' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `model_providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_models_provider_key_version_uq` ON `provider_models` (`provider_id`,`model_key`,`model_version`);--> statement-breakpoint
ALTER TABLE `presentation_projects` ADD `scene` text;--> statement-breakpoint
ALTER TABLE `presentation_projects` ADD `readiness_status` text DEFAULT 'NEEDS_CONFIRMATION' NOT NULL;--> statement-breakpoint
ALTER TABLE `presentation_projects` ADD `truth_status` text DEFAULT 'UNVERIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE `presentation_projects` ADD `source_section_version_id` text REFERENCES section_versions(id);--> statement-breakpoint
ALTER TABLE `presentation_projects` ADD `source_material_snapshot_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `presentation_versions` ADD `status` text DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE `presentation_versions` ADD `source_presentation_version_id` text;--> statement-breakpoint
ALTER TABLE `presentation_versions` ADD `source_section_version_id` text REFERENCES section_versions(id);--> statement-breakpoint
ALTER TABLE `presentation_versions` ADD `material_snapshot_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `presentation_versions` ADD `verification_status` text DEFAULT 'UNVERIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE `slides` ADD `source_bindings_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `slides` ADD `verification_status` text DEFAULT 'UNVERIFIED' NOT NULL;