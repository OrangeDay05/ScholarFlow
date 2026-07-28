ALTER TABLE `reviewer_comments` ADD `status` text DEFAULT 'OPEN' NOT NULL;--> statement-breakpoint
ALTER TABLE `revision_tasks` ADD `response_strategy` text DEFAULT 'AGREE' NOT NULL;--> statement-breakpoint
ALTER TABLE `revision_tasks` ADD `decision_reason` text;--> statement-breakpoint
ALTER TABLE `revision_tasks` ADD `incomplete_experiment_warning` text;