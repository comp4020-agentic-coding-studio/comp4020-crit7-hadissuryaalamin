CREATE TABLE `courses` (
	`code` text NOT NULL,
	`year` integer NOT NULL,
	`title` text NOT NULL,
	`units` integer NOT NULL,
	`level` integer NOT NULL,
	`offered_s1` integer NOT NULL,
	`offered_s2` integer NOT NULL,
	`offering_known` integer NOT NULL,
	`prereq_text` text,
	`prereq_expr` text,
	`incompatible` text DEFAULT '[]' NOT NULL,
	`repeatable_times` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`code`, `year`)
);
--> statement-breakpoint
CREATE TABLE `group_courses` (
	`group_id` integer NOT NULL,
	`course_code` text NOT NULL,
	PRIMARY KEY(`group_id`, `course_code`),
	FOREIGN KEY (`group_id`) REFERENCES `requirement_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `plan_courses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` text NOT NULL,
	`semester_index` integer NOT NULL,
	`course_code` text NOT NULL,
	`unverified` integer DEFAULT false NOT NULL,
	`units` integer NOT NULL,
	`level` integer NOT NULL,
	`added_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`program_code` text NOT NULL,
	`start_year` integer NOT NULL,
	`start_semester` integer NOT NULL,
	`current_semester` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `programs` (
	`code` text NOT NULL,
	`year` integer NOT NULL,
	`name` text NOT NULL,
	`total_units` integer NOT NULL,
	`semesters` integer NOT NULL,
	PRIMARY KEY(`code`, `year`)
);
--> statement-breakpoint
CREATE TABLE `requirement_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`program_code` text NOT NULL,
	`year` integer NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`units_required` integer NOT NULL,
	`filter_subjects` text,
	`filter_min_level` integer,
	`pathway` text
);
