CREATE TABLE "auth"."membership_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"invitation_id" uuid,
	"actor_type" varchar(30) NOT NULL,
	"actor_id" varchar(255),
	"action" varchar(50) NOT NULL,
	"before_role" varchar(30),
	"after_role" varchar(30),
	"reason" text,
	"request_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_membership_events_workspace" ON "auth"."membership_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_membership_events_user" ON "auth"."membership_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_membership_events_created" ON "auth"."membership_events" USING btree ("created_at");