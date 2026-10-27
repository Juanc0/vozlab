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
ALTER TABLE "tenant_identity_providers" ADD CONSTRAINT "tenant_identity_providers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tenant_idp_tenant" ON "tenant_identity_providers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_idp_issuer" ON "tenant_identity_providers" USING btree ("issuer");