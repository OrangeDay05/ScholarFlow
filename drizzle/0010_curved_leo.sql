CREATE TABLE `credential_secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`credential_metadata_id` text NOT NULL,
	`ciphertext` text NOT NULL,
	`initialization_vector` text NOT NULL,
	`key_version` text NOT NULL,
	`algorithm` text DEFAULT 'AES-GCM-256' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`rotated_at` text,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`credential_metadata_id`) REFERENCES `credential_metadata`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credential_secrets_metadata_uq` ON `credential_secrets` (`credential_metadata_id`);--> statement-breakpoint
CREATE INDEX `credential_secrets_owner_idx` ON `credential_secrets` (`owner_user_id`);