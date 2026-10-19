CREATE TABLE "meta"."data_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_key" varchar(200) NOT NULL,
	"connector_type" varchar(30) NOT NULL,
	"behavior_profile" varchar(20) DEFAULT 'BATCH' NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta"."data_sources" ADD CONSTRAINT "data_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_data_sources_workspace_key" ON "meta"."data_sources" USING btree ("workspace_id","source_key");--> statement-breakpoint
CREATE INDEX "idx_data_sources_key" ON "meta"."data_sources" USING btree ("source_key");