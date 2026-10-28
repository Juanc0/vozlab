ALTER TABLE "global_identities" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "global_identities" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "global_identities" ADD COLUMN "full_name" varchar(255);--> statement-breakpoint
ALTER TABLE "global_identities" ADD COLUMN "picture" varchar(1024);--> statement-breakpoint
ALTER TABLE "global_identities" ADD COLUMN "last_login_at" timestamp with time zone;