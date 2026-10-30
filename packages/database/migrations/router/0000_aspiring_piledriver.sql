CREATE TABLE "event_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"label" varchar(255),
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "global_user_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"global_user_id" uuid NOT NULL,
	"tenant_id" uuid,
	"actor_type" varchar(30) NOT NULL,
	"actor_id" varchar(255),
	"action" varchar(50) NOT NULL,
	"metadata" text,
	"request_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_user_tenants" (
	"global_user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_user_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "global_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuer" varchar(512) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"email" varchar(255),
	"email_verified" boolean DEFAULT false NOT NULL,
	"full_name" varchar(255),
	"picture" varchar(1024),
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"host" varchar(255) NOT NULL,
	"port" integer DEFAULT 5432 NOT NULL,
	"database" varchar(100) NOT NULL,
	"user" varchar(100) NOT NULL,
	"password" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_identity_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider_kind" varchar(30) NOT NULL,
	"issuer" varchar(512) NOT NULL,
	"client_id" varchar(255),
	"metadata_url" varchar(1024),
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"oidc_tenant_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"provisioned" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "event_codes" ADD CONSTRAINT "event_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_user_tenants" ADD CONSTRAINT "global_user_tenants_global_user_id_global_users_id_fk" FOREIGN KEY ("global_user_id") REFERENCES "public"."global_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_user_tenants" ADD CONSTRAINT "global_user_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_invitations" ADD CONSTRAINT "global_invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_connections" ADD CONSTRAINT "tenant_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_identity_providers" ADD CONSTRAINT "tenant_identity_providers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_event_codes_tenant_workspace" ON "event_codes" USING btree ("tenant_id","workspace_id");--> statement-breakpoint
CREATE INDEX "idx_event_codes_expires_at" ON "event_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_global_user_events_identity" ON "global_user_events" USING btree ("global_user_id");--> statement-breakpoint
CREATE INDEX "idx_global_user_events_tenant" ON "global_user_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_global_user_events_created" ON "global_user_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_global_user_tenant" ON "global_user_tenants" USING btree ("global_user_id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_tenant_user" ON "global_user_tenants" USING btree ("tenant_id","tenant_user_id");--> statement-breakpoint
CREATE INDEX "idx_global_invitations_tenant" ON "global_invitations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_global_invitations_email" ON "global_invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_global_users_issuer_subject" ON "global_users" USING btree ("issuer","subject");--> statement-breakpoint
CREATE INDEX "idx_tenant_idp_tenant" ON "tenant_identity_providers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_idp_issuer" ON "tenant_identity_providers" USING btree ("issuer");