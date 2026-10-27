CREATE TABLE "global_identity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"global_identity_id" uuid NOT NULL,
	"tenant_id" uuid,
	"actor_type" varchar(30) NOT NULL,
	"actor_id" varchar(255),
	"action" varchar(50) NOT NULL,
	"metadata" text,
	"request_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_global_identity_events_identity" ON "global_identity_events" USING btree ("global_identity_id");--> statement-breakpoint
CREATE INDEX "idx_global_identity_events_tenant" ON "global_identity_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_global_identity_events_created" ON "global_identity_events" USING btree ("created_at");