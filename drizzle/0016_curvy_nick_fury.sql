CREATE TABLE `presentation_exports` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`presentation_version_id` text NOT NULL,
	`format` text DEFAULT 'pptx' NOT NULL,
	`object_key` text NOT NULL,
	`content_hash` text NOT NULL,
	`file_size` integer NOT NULL,
	`runner_id` text NOT NULL,
	`runner_version` text NOT NULL,
	`artifact_tool_version` text NOT NULL,
	`status` text NOT NULL,
	`opened_verified_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`presentation_version_id`) REFERENCES `presentation_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `presentation_exports_owner_version_idx` ON `presentation_exports` (`owner_user_id`,`presentation_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `presentation_exports_version_hash_uq` ON `presentation_exports` (`presentation_version_id`,`content_hash`);