CREATE TABLE `material_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`material_id` text NOT NULL,
	`object_key` text NOT NULL,
	`storage_provider` text NOT NULL,
	`original_filename` text NOT NULL,
	`normalized_filename` text NOT NULL,
	`detected_extension` text NOT NULL,
	`client_content_type` text,
	`detected_content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`content_hash` text,
	`etag` text,
	`status` text DEFAULT 'PENDING_UPLOAD' NOT NULL,
	`idempotency_key` text,
	`error_code` text,
	`error_message` text,
	`retention_status` text DEFAULT 'ACTIVE' NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `material_objects_object_key_uq` ON `material_objects` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `material_objects_owner_idempotency_uq` ON `material_objects` (`owner_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `material_objects_owner_project_idx` ON `material_objects` (`owner_user_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `material_objects_material_created_idx` ON `material_objects` (`material_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `material_storage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`material_id` text NOT NULL,
	`material_object_id` text NOT NULL,
	`event_type` text NOT NULL,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`material_object_id`) REFERENCES `material_objects`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `material_storage_events_owner_project_idx` ON `material_storage_events` (`owner_user_id`,`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `material_storage_events_object_idx` ON `material_storage_events` (`material_object_id`,`created_at`);