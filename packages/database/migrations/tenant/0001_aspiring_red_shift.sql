CREATE SCHEMA "social";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta"."datatype_properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"system_key" varchar(100) NOT NULL,
	"display_names" jsonb NOT NULL,
	"descriptions" jsonb DEFAULT '{}'::jsonb,
	"datatype" varchar(30) DEFAULT 'string' NOT NULL,
	"allowed_values" jsonb,
	"is_required" boolean DEFAULT false NOT NULL,
	"default_value" jsonb,
	"domain_class_key" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'PROPOSED' NOT NULL,
	"proposed_by" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta"."object_properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"system_key" varchar(100) NOT NULL,
	"display_names" jsonb NOT NULL,
	"descriptions" jsonb DEFAULT '{}'::jsonb,
	"domain_class_key" varchar(100) NOT NULL,
	"range_class_key" varchar(100) NOT NULL,
	"is_directional" boolean DEFAULT true NOT NULL,
	"is_symmetric" boolean DEFAULT false NOT NULL,
	"allows_self_relation" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'PROPOSED' NOT NULL,
	"proposed_by" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interactions_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_hash" varchar(64) NOT NULL,
	"target_id" uuid NOT NULL,
	"target_type" varchar(30) NOT NULL,
	"interaction_type" varchar(20) NOT NULL,
	"value" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social"."discussion_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"parent_post_id" uuid,
	"author_hash" varchar(64) NOT NULL,
	"body" text NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"downvotes" integer DEFAULT 0 NOT NULL,
	"community_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social"."discussion_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"target_type" varchar(30) NOT NULL,
	"title" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"created_by_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meta"."datatype_properties" ADD CONSTRAINT "datatype_properties_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meta"."object_properties" ADD CONSTRAINT "object_properties_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interactions_log" ADD CONSTRAINT "interactions_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social"."discussion_posts" ADD CONSTRAINT "discussion_posts_thread_id_discussion_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "social"."discussion_threads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social"."discussion_threads" ADD CONSTRAINT "discussion_threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_datatype_properties_domain_class" ON "meta"."datatype_properties" USING btree ("workspace_id","domain_class_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_object_properties_domain_range" ON "meta"."object_properties" USING btree ("workspace_id","domain_class_key","range_class_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_user_target_vote" ON "interactions_log" USING btree ("user_hash","target_id","target_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_interactions_target" ON "interactions_log" USING btree ("target_id","target_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discussion_posts_thread" ON "social"."discussion_posts" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discussion_posts_parent" ON "social"."discussion_posts" USING btree ("parent_post_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discussion_threads_target" ON "social"."discussion_threads" USING btree ("target_id","target_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discussion_threads_workspace" ON "social"."discussion_threads" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ontology_classes_workspace_key" ON "meta"."ontology_classes" USING btree ("workspace_id","system_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_edges_workspace_status" ON "edges" USING btree ("workspace_id","status") WHERE "edges"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_edges_source" ON "edges" USING btree ("source_node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_edges_target" ON "edges" USING btree ("target_node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nodes_embedding_hnsw" ON "nodes" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nodes_workspace_status" ON "nodes" USING btree ("workspace_id","status") WHERE "nodes"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nodes_attributes_gin" ON "nodes" USING gin ("attributes");