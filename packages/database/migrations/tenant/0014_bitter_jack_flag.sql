CREATE TABLE "auth"."workspace_join_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"label" varchar(255),
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"auto_approve" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_join_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "auth"."workspace_join_codes" ADD CONSTRAINT "workspace_join_codes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_workspace_join_codes_workspace" ON "auth"."workspace_join_codes" USING btree ("workspace_id");