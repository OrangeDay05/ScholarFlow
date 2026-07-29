CREATE TABLE `agent_role_model_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text,
	`project_id` text,
	`agent_role` text NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`credential_type` text NOT NULL,
	`credential_reference` text NOT NULL,
	`thinking_mode` text NOT NULL,
	`reasoning_effort` text,
	`max_output_tokens` integer NOT NULL,
	`timeout_ms` integer NOT NULL,
	`per_turn_budget` integer NOT NULL,
	`tools_allowed` integer DEFAULT false NOT NULL,
	`fallback_config_id` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_id`) REFERENCES `model_providers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`model_id`) REFERENCES `provider_models`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `agent_role_config_owner_project_idx` ON `agent_role_model_configs` (`owner_user_id`,`project_id`,`agent_role`);--> statement-breakpoint
CREATE TABLE `model_capability_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`capability_version` text NOT NULL,
	`supports_thinking` integer DEFAULT false NOT NULL,
	`supported_thinking_modes_json` text DEFAULT '[]' NOT NULL,
	`supported_reasoning_efforts_json` text DEFAULT '[]' NOT NULL,
	`supports_streaming` integer DEFAULT false NOT NULL,
	`supports_tool_calls` integer DEFAULT false NOT NULL,
	`supports_thinking_tool_calls` integer DEFAULT false NOT NULL,
	`supports_json_output` integer DEFAULT false NOT NULL,
	`supports_vision` integer DEFAULT false NOT NULL,
	`context_window` integer NOT NULL,
	`max_output_tokens` integer NOT NULL,
	`supported_parameters_json` text DEFAULT '[]' NOT NULL,
	`ignored_parameters_json` text DEFAULT '[]' NOT NULL,
	`lifecycle_status` text NOT NULL,
	`deprecated_at` text,
	`source_updated_at` text NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `model_providers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`model_id`) REFERENCES `provider_models`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_capability_model_version_uq` ON `model_capability_versions` (`model_id`,`capability_version`);--> statement-breakpoint
CREATE INDEX `model_capability_lifecycle_idx` ON `model_capability_versions` (`lifecycle_status`);--> statement-breakpoint
CREATE TABLE `model_pricing_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`pricing_version` text NOT NULL,
	`input_cache_hit_price` text NOT NULL,
	`input_cache_miss_price` text NOT NULL,
	`output_price` text NOT NULL,
	`currency` text NOT NULL,
	`unit` text NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`source_updated_at` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `model_providers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`model_id`) REFERENCES `provider_models`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_pricing_model_version_uq` ON `model_pricing_versions` (`model_id`,`pricing_version`);--> statement-breakpoint
CREATE TABLE `provider_catalog_syncs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`status` text NOT NULL,
	`discovered_model_ids_json` text DEFAULT '[]' NOT NULL,
	`error_code` text,
	`synced_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `model_providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `provider_catalog_sync_provider_idx` ON `provider_catalog_syncs` (`provider_id`,`synced_at`);--> statement-breakpoint
CREATE TABLE `provider_run_records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`usage_category` text NOT NULL,
	`status` text NOT NULL,
	`prompt_tokens` integer,
	`cache_hit_tokens` integer,
	`cache_miss_tokens` integer,
	`completion_tokens` integer,
	`reasoning_tokens` integer,
	`reasoning_content_produced` integer DEFAULT false NOT NULL,
	`reasoning_content_characters` integer DEFAULT 0 NOT NULL,
	`tool_call_names_json` text DEFAULT '[]' NOT NULL,
	`estimated_cost` text,
	`final_cost` text,
	`currency` text,
	`finish_reason` text,
	`error_code` text,
	`retryable` integer,
	`provider_request_id` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_id`) REFERENCES `resolved_model_config_snapshots`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `provider_run_owner_project_idx` ON `provider_run_records` (`owner_user_id`,`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `resolved_model_config_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`conversation_session_id` text,
	`agent_role` text NOT NULL,
	`provider` text NOT NULL,
	`provider_model_id` text NOT NULL,
	`capability_version` text NOT NULL,
	`thinking_mode` text NOT NULL,
	`reasoning_effort` text,
	`effective_parameters_json` text NOT NULL,
	`ignored_parameters_json` text DEFAULT '[]' NOT NULL,
	`credential_type` text NOT NULL,
	`credential_reference` text NOT NULL,
	`pricing_version` text,
	`confirmed_by_user` integer DEFAULT false NOT NULL,
	`confirmed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `ai_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_session_id`) REFERENCES `conversation_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_model_id`) REFERENCES `provider_models`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `resolved_model_snapshot_task_idx` ON `resolved_model_config_snapshots` (`owner_user_id`,`project_id`,`task_id`);