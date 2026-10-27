CREATE TABLE "global_identity_tenants" (
	"global_identity_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_user_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "global_identity_tenants" ADD CONSTRAINT "global_identity_tenants_global_identity_id_global_identities_id_fk" FOREIGN KEY ("global_identity_id") REFERENCES "public"."global_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_identity_tenants" ADD CONSTRAINT "global_identity_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_global_identity_tenant" ON "global_identity_tenants" USING btree ("global_identity_id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_tenant_user" ON "global_identity_tenants" USING btree ("tenant_id","tenant_user_id");