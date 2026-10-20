ALTER TABLE "edit_proposals" ADD COLUMN "kind" varchar(20) DEFAULT 'EDIT' NOT NULL;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "merged_into_id" uuid;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_merged_into_id_nodes_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."nodes"("id") ON DELETE set null ON UPDATE no action;