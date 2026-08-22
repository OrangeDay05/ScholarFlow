ALTER TABLE `section_versions` ADD `content_json` text;--> statement-breakpoint
ALTER TABLE `material_chunks` ADD `block_id` text;--> statement-breakpoint
ALTER TABLE `material_chunks` ADD `block_type` text;--> statement-breakpoint
ALTER TABLE `material_chunks` ADD `section_path_json` text NOT NULL DEFAULT '[]';--> statement-breakpoint
CREATE TABLE `parsed_documents` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_user_id` text NOT NULL,
  `project_id` text NOT NULL,
  `material_id` text NOT NULL,
  `parse_run_id` text NOT NULL,
  `model_version` integer NOT NULL DEFAULT 1,
  `content_json` text NOT NULL,
  `plain_text` text NOT NULL,
  `stats_json` text NOT NULL DEFAULT '{}',
  `warnings_json` text NOT NULL DEFAULT '[]',
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`parse_run_id`) REFERENCES `material_parse_runs`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `parsed_documents_run_uq` ON `parsed_documents` (`parse_run_id`);--> statement-breakpoint
CREATE INDEX `parsed_documents_owner_project_material_idx` ON `parsed_documents` (`owner_user_id`,`project_id`,`material_id`);--> statement-breakpoint
CREATE TABLE `parsed_document_assets` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_user_id` text NOT NULL,
  `project_id` text NOT NULL,
  `material_id` text NOT NULL,
  `parse_run_id` text NOT NULL,
  `parsed_document_id` text NOT NULL,
  `relationship_id` text,
  `filename` text NOT NULL,
  `content_type` text NOT NULL,
  `object_key` text NOT NULL,
  `content_hash` text NOT NULL,
  `file_size` integer NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`parse_run_id`) REFERENCES `material_parse_runs`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`parsed_document_id`) REFERENCES `parsed_documents`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `parsed_document_assets_object_key_uq` ON `parsed_document_assets` (`object_key`);--> statement-breakpoint
CREATE INDEX `parsed_document_assets_scope_idx` ON `parsed_document_assets` (`owner_user_id`,`project_id`,`material_id`);
