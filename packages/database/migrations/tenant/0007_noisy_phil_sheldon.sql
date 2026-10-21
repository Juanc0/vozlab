DROP INDEX "idx_edges_workspace_source";--> statement-breakpoint
DROP INDEX "idx_edges_workspace_target";--> statement-breakpoint
CREATE INDEX "idx_edges_workspace_source_ranked" ON "edges" USING btree ("workspace_id","source_node_id","community_score" DESC NULLS FIRST,"created_at" DESC NULLS FIRST) WHERE "edges"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_edges_workspace_target_ranked" ON "edges" USING btree ("workspace_id","target_node_id","community_score" DESC NULLS FIRST,"created_at" DESC NULLS FIRST) WHERE "edges"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_nodes_workspace_created" ON "nodes" USING btree ("workspace_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "nodes"."deleted_at" IS NULL;