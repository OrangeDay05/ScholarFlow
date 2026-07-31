CREATE TABLE `section_candidate_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`section_id` text NOT NULL,
	`candidate_version_id` text NOT NULL,
	`base_version_id` text NOT NULL,
	`decision` text NOT NULL,
	`result_version_id` text,
	`idempotency_key` text NOT NULL,
	`decided_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_version_id`) REFERENCES `section_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`base_version_id`) REFERENCES `section_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`result_version_id`) REFERENCES `section_versions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `section_candidate_decisions_version_decision_uq` ON `section_candidate_decisions` (`candidate_version_id`,`decision`);--> statement-breakpoint
CREATE UNIQUE INDEX `section_candidate_decisions_owner_project_idempotency_uq` ON `section_candidate_decisions` (`owner_user_id`,`project_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `section_candidate_decisions_owner_section_idx` ON `section_candidate_decisions` (`owner_user_id`,`section_id`,`decided_at`);--> statement-breakpoint
ALTER TABLE `conversation_tool_intents` ADD `section_id` text;--> statement-breakpoint
ALTER TABLE `conversation_tool_intents` ADD `base_version_id` text;--> statement-breakpoint
ALTER TABLE `conversation_tool_intents` ADD `excluded_scope` text;