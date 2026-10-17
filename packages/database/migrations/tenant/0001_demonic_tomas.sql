DROP INDEX "idx_edges_source";--> statement-breakpoint
DROP INDEX "idx_edges_target";--> statement-breakpoint
CREATE INDEX "idx_edges_workspace_source" ON "edges" USING btree ("workspace_id","source_node_id") WHERE "edges"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_edges_workspace_target" ON "edges" USING btree ("workspace_id","target_node_id") WHERE "edges"."deleted_at" IS NULL;