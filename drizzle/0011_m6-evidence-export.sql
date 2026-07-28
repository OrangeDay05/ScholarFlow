ALTER TABLE `evidence_bindings` ADD `material_chunk_id` text REFERENCES material_chunks(id);--> statement-breakpoint
ALTER TABLE `evidence_bindings` ADD `verification_status` text DEFAULT 'UNVERIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE `evidence_bindings` ADD `risk_level` text DEFAULT 'NORMAL' NOT NULL;--> statement-breakpoint
ALTER TABLE `evidence_bindings` ADD `verification_note` text;--> statement-breakpoint
ALTER TABLE `evidence_bindings` ADD `verified_at` text;--> statement-breakpoint
CREATE INDEX `evidence_chunk_idx` ON `evidence_bindings` (`material_chunk_id`);--> statement-breakpoint
ALTER TABLE `export_records` ADD `readiness_report_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `export_records` ADD `blocked_reason` text;