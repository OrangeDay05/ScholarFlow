CREATE TABLE `conversation_action_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`conversation_session_id` text NOT NULL,
	`proposal_id` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text,
	`idempotency_key` text NOT NULL,
	`decided_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_session_id`) REFERENCES `conversation_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`proposal_id`) REFERENCES `conversation_action_proposals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_action_decisions_proposal_uq` ON `conversation_action_decisions` (`proposal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_decisions_owner_project_idempotency_uq` ON `conversation_action_decisions` (`owner_user_id`,`project_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `conversation_decisions_owner_session_created_idx` ON `conversation_action_decisions` (`owner_user_id`,`conversation_session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `conversation_action_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`conversation_session_id` text NOT NULL,
	`tool_intent_id` text NOT NULL,
	`title` text NOT NULL,
	`effect` text NOT NULL,
	`warnings_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'AWAITING_USER_CONFIRMATION' NOT NULL,
	`recovery_status` text DEFAULT 'WAITING_FOR_USER' NOT NULL,
	`idempotency_key` text NOT NULL,
	`decided_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_session_id`) REFERENCES `conversation_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tool_intent_id`) REFERENCES `conversation_tool_intents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_proposals_intent_uq` ON `conversation_action_proposals` (`tool_intent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_proposals_owner_project_idempotency_uq` ON `conversation_action_proposals` (`owner_user_id`,`project_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `conversation_proposals_owner_session_updated_idx` ON `conversation_action_proposals` (`owner_user_id`,`conversation_session_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `conversation_tool_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`conversation_session_id` text NOT NULL,
	`product_skill` text NOT NULL,
	`operation` text NOT NULL,
	`rationale` text NOT NULL,
	`authorized_material_ids_json` text DEFAULT '[]' NOT NULL,
	`state` text DEFAULT 'PROPOSED' NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_session_id`) REFERENCES `conversation_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_intents_owner_project_idempotency_uq` ON `conversation_tool_intents` (`owner_user_id`,`project_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `conversation_intents_owner_session_created_idx` ON `conversation_tool_intents` (`owner_user_id`,`conversation_session_id`,`created_at`);