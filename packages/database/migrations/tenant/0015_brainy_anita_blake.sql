ALTER TABLE "auth"."users" ADD COLUMN "is_anonymous" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."workspaces" ADD COLUMN "kind" varchar(20) DEFAULT 'PRIVATE' NOT NULL;