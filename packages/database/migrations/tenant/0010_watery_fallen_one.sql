CREATE TABLE "auth"."invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" varchar(255),
	"email_hash" varchar(64),
	"role" varchar(30) DEFAULT 'MEMBER' NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "auth"."workspace_memberships" ADD COLUMN "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."invitations" ADD CONSTRAINT "invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invitations_workspace" ON "auth"."invitations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_invitations_status" ON "auth"."invitations" USING btree ("status");