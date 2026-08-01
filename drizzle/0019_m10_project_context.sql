CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspaces_owner_idx` ON `workspaces` (`owner_user_id`);
--> statement-breakpoint
CREATE TABLE `workspace_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_memberships_workspace_user_role_uq` ON `workspace_memberships` (`workspace_id`,`user_id`,`role`);
--> statement-breakpoint
CREATE INDEX `workspace_memberships_user_role_idx` ON `workspace_memberships` (`user_id`,`role`);
--> statement-breakpoint
ALTER TABLE `projects` ADD `workspace_id` text REFERENCES workspaces(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE TABLE `project_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`can_edit` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_memberships_project_user_role_uq` ON `project_memberships` (`project_id`,`user_id`,`role`);
--> statement-breakpoint
CREATE INDEX `project_memberships_user_role_idx` ON `project_memberships` (`user_id`,`role`);
--> statement-breakpoint
CREATE TABLE `review_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`reviewer_user_id` text NOT NULL,
	`status` text DEFAULT 'assigned' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_assignments_project_reviewer_uq` ON `review_assignments` (`project_id`,`reviewer_user_id`);
--> statement-breakpoint
CREATE INDEX `review_assignments_reviewer_status_idx` ON `review_assignments` (`reviewer_user_id`,`status`);
--> statement-breakpoint
INSERT OR IGNORE INTO `workspaces` (`id`, `owner_user_id`, `name`)
SELECT 'workspace-' || `id`, `id`, `display_name` || ' 的工作区' FROM `users`;
--> statement-breakpoint
INSERT OR IGNORE INTO `workspace_memberships` (`id`, `workspace_id`, `user_id`, `role`, `status`)
SELECT 'workspace-member-author-' || `id`, 'workspace-' || `id`, `id`, 'AUTHOR', 'active' FROM `users`;
--> statement-breakpoint
UPDATE `projects` SET `workspace_id` = 'workspace-' || `owner_user_id` WHERE `workspace_id` IS NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `project_memberships` (`id`, `workspace_id`, `project_id`, `user_id`, `role`, `can_edit`, `status`)
SELECT 'project-member-author-' || `id`, `workspace_id`, `id`, `owner_user_id`, 'AUTHOR', 1, 'active' FROM `projects`;
