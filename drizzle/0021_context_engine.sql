CREATE TABLE `agent_context_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`conversation_session_id` text,
	`task_id` text,
	`provider_run_id` text,
	`agent_role` text NOT NULL,
	`task_intent` text NOT NULL,
	`policy_name` text NOT NULL,
	`policy_version` text NOT NULL,
	`diagnosis_card_id` text,
	`diagnosis_card_version` integer,
	`outline_id` text,
	`outline_version` integer,
	`section_id` text,
	`section_version_id` text,
	`conversation_summary_id` text,
	`recent_message_ids_json` text DEFAULT '[]' NOT NULL,
	`authorized_material_ids_json` text DEFAULT '[]' NOT NULL,
	`original_query` text NOT NULL,
	`rewritten_queries_json` text DEFAULT '[]' NOT NULL,
	`retrieval_filters_json` text DEFAULT '{}' NOT NULL,
	`retrieval_algorithm` text NOT NULL,
	`retrieval_version` text NOT NULL,
	`retrieval_mode` text NOT NULL,
	`token_budget` integer NOT NULL,
	`estimated_context_tokens` integer NOT NULL,
	`provider` text,
	`model` text,
	`prompt_hash` text NOT NULL,
	`context_hash` text NOT NULL,
	`capability_status_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_session_id`) REFERENCES `conversation_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`task_id`) REFERENCES `ai_tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`provider_run_id`) REFERENCES `provider_run_records`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_context_snapshots_scope_idx` ON `agent_context_snapshots` (`owner_user_id`,`project_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `agent_context_snapshots_conversation_idx` ON `agent_context_snapshots` (`conversation_session_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `context_snapshot_items` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`item_type` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`material_id` text,
	`parse_run_id` text,
	`material_chunk_id` text,
	`content_hash` text NOT NULL,
	`source_location_json` text DEFAULT '{}' NOT NULL,
	`content` text NOT NULL,
	`retrieval_method` text,
	`lexical_score` real,
	`vector_score` real,
	`fused_score` real,
	`rerank_score` real,
	`rank` integer,
	`included` integer DEFAULT 1 NOT NULL,
	`estimated_tokens` integer DEFAULT 0 NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `agent_context_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parse_run_id`) REFERENCES `material_parse_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`material_chunk_id`) REFERENCES `material_chunks`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `context_snapshot_items_snapshot_rank_idx` ON `context_snapshot_items` (`snapshot_id`,`included`,`rank`);
--> statement-breakpoint
CREATE INDEX `context_snapshot_items_material_chunk_idx` ON `context_snapshot_items` (`material_id`,`material_chunk_id`);
--> statement-breakpoint
CREATE TRIGGER `agent_context_snapshots_immutable_update`
BEFORE UPDATE ON `agent_context_snapshots`
BEGIN
	SELECT RAISE(ABORT, 'agent_context_snapshots are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `context_snapshot_items_immutable_update`
BEFORE UPDATE ON `context_snapshot_items`
BEGIN
	SELECT RAISE(ABORT, 'context_snapshot_items are immutable');
END;
--> statement-breakpoint
CREATE TABLE `agent_working_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`conversation_session_id` text,
	`agent_role` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text,
	`memory_type` text NOT NULL,
	`content_json` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`expires_at` text,
	`superseded_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_session_id`) REFERENCES `conversation_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_working_memories_active_scope_idx` ON `agent_working_memories` (`owner_user_id`,`project_id`,`agent_role`,`status`);
--> statement-breakpoint
CREATE TABLE `agent_handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`conversation_session_id` text,
	`from_agent_role` text NOT NULL,
	`to_agent_role` text NOT NULL,
	`source_task_id` text,
	`target_task_id` text,
	`goal` text NOT NULL,
	`confirmed_inputs_json` text DEFAULT '[]' NOT NULL,
	`relevant_decisions_json` text DEFAULT '[]' NOT NULL,
	`open_questions_json` text DEFAULT '[]' NOT NULL,
	`warnings_json` text DEFAULT '[]' NOT NULL,
	`artifact_refs_json` text DEFAULT '[]' NOT NULL,
	`recommended_material_ids_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`consumed_at` text,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_session_id`) REFERENCES `conversation_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_handoffs_target_scope_idx` ON `agent_handoffs` (`owner_user_id`,`project_id`,`to_agent_role`,`status`);
--> statement-breakpoint
CREATE TABLE `material_chunk_embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`material_id` text NOT NULL,
	`parse_run_id` text NOT NULL,
	`material_chunk_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`dimension` integer,
	`vector_record_id` text,
	`content_hash` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`error_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parse_run_id`) REFERENCES `material_parse_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_chunk_id`) REFERENCES `material_chunks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `material_chunk_embeddings_chunk_model_uq` ON `material_chunk_embeddings` (`material_chunk_id`,`provider`,`model`);
--> statement-breakpoint
CREATE INDEX `material_chunk_embeddings_scope_status_idx` ON `material_chunk_embeddings` (`owner_user_id`,`project_id`,`status`);
--> statement-breakpoint
CREATE TABLE `evidence_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`context_snapshot_item_id` text NOT NULL,
	`answer_message_id` text,
	`claim_text` text NOT NULL,
	`quote` text NOT NULL,
	`status` text DEFAULT 'CANDIDATE' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`decided_at` text,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`context_snapshot_item_id`) REFERENCES `context_snapshot_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`answer_message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `evidence_candidates_scope_status_idx` ON `evidence_candidates` (`owner_user_id`,`project_id`,`status`);
--> statement-breakpoint
ALTER TABLE `provider_run_records` ADD `agent_context_snapshot_id` text;
--> statement-breakpoint
CREATE INDEX `provider_run_context_snapshot_idx` ON `provider_run_records` (`agent_context_snapshot_id`);
