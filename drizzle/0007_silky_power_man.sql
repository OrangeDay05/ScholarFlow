CREATE TABLE `conversation_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`conversation_session_id` text NOT NULL,
	`client_message_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_session_id`) REFERENCES `conversation_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_messages_session_client_uq` ON `conversation_messages` (`conversation_session_id`,`client_message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_messages_session_ordinal_uq` ON `conversation_messages` (`conversation_session_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `conversation_messages_owner_project_created_idx` ON `conversation_messages` (`owner_user_id`,`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `conversation_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`active_product_skill` text,
	`idempotency_key` text NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`summary_count` integer DEFAULT 0 NOT NULL,
	`last_message_at` text,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_sessions_owner_project_idempotency_uq` ON `conversation_sessions` (`owner_user_id`,`project_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `conversation_sessions_owner_project_updated_idx` ON `conversation_sessions` (`owner_user_id`,`project_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `conversation_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`conversation_session_id` text NOT NULL,
	`client_summary_id` text NOT NULL,
	`text` text NOT NULL,
	`source_from_ordinal` integer NOT NULL,
	`source_to_ordinal` integer NOT NULL,
	`source_message_ids_json` text NOT NULL,
	`status` text DEFAULT 'DERIVED_NOT_USER_CONFIRMED' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_session_id`) REFERENCES `conversation_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_summaries_session_client_uq` ON `conversation_summaries` (`conversation_session_id`,`client_summary_id`);--> statement-breakpoint
CREATE INDEX `conversation_summaries_owner_project_created_idx` ON `conversation_summaries` (`owner_user_id`,`project_id`,`created_at`);