CREATE TABLE "auth"."workspace_join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"message" varchar(500),
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth"."workspaces" ADD COLUMN "join_code" varchar(24);--> statement-breakpoint
UPDATE "auth"."workspaces" SET "join_code" = upper(substr(md5("id"::text), 1, 16)) WHERE "join_code" IS NULL;--> statement-breakpoint
ALTER TABLE "auth"."workspaces" ALTER COLUMN "join_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."workspace_join_requests" ADD CONSTRAINT "workspace_join_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."workspace_join_requests" ADD CONSTRAINT "workspace_join_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."workspace_join_requests" ADD CONSTRAINT "workspace_join_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_join_requests_workspace_status" ON "auth"."workspace_join_requests" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "idx_join_requests_user" ON "auth"."workspace_join_requests" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_join_requests_pending_user_workspace" ON "auth"."workspace_join_requests" USING btree ("workspace_id","user_id") WHERE status = 'PENDING';--> statement-breakpoint
ALTER TABLE "auth"."workspaces" ADD CONSTRAINT "workspaces_join_code_unique" UNIQUE("join_code");