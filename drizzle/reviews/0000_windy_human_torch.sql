CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`rating` integer NOT NULL,
	`title` text,
	`comment` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
