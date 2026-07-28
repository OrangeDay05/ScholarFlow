ALTER TABLE `export_records` ADD `artifact_type` text DEFAULT 'MANUSCRIPT' NOT NULL;--> statement-breakpoint
ALTER TABLE `export_records` ADD `source_revision_task_ids_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `revision_tasks` ADD `verification_status` text DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE `revision_tasks` ADD `verification_note` text;--> statement-breakpoint
ALTER TABLE `revision_tasks` ADD `verified_at` text;