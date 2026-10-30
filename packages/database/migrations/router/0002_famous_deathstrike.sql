CREATE TABLE "credential_routes" (
	"credential_hash" varchar(64) NOT NULL,
	"kind" varchar(12) NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credential_routes_credential_hash_unique" UNIQUE("credential_hash"),
	CONSTRAINT "credential_routes_kind_check" CHECK ("credential_routes"."kind" IN ('EVENT', 'INVITATION'))
);
--> statement-breakpoint
DROP TABLE "event_codes" CASCADE;--> statement-breakpoint
ALTER TABLE "credential_routes" ADD CONSTRAINT "credential_routes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;