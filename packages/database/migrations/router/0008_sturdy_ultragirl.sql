CREATE TABLE "global_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"tenant_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"role" varchar(30) DEFAULT 'MEMBER' NOT NULL,
	"email" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "global_invitations" ADD CONSTRAINT "global_invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_global_invitations_tenant" ON "global_invitations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_global_invitations_email" ON "global_invitations" USING btree ("email");