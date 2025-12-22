CREATE TABLE `bookmarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`desc` text DEFAULT '',
	`icon` text DEFAULT '',
	`categoryId` integer DEFAULT 0,
	`index` integer DEFAULT 0 NOT NULL,
	`tags` text DEFAULT '',
	`note` text DEFAULT '',
	`isPrivate` integer DEFAULT 0 NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`deletedAt` text
);
--> statement-breakpoint
CREATE TABLE `categorys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`index` integer DEFAULT 0 NOT NULL,
	`parentId` integer DEFAULT 0,
	`depth` integer DEFAULT 0 NOT NULL,
	`isPrivate` integer DEFAULT 0 NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`deletedAt` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`remark` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`deletedAt` text
);
--> statement-breakpoint
DROP TABLE `users_table`;