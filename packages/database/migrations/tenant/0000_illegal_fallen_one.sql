CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE SCHEMA "meta";
--> statement-breakpoint
CREATE SCHEMA "social";
--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255),
	"full_name" varchar(255),
	"provider" varchar(50) NOT NULL,
	"provider_user_id" varchar(255),
	"author_hash" varchar(64) NOT NULL,
	"anonymous_alias" varchar(100),
	"system_role" varchar(30) DEFAULT 'USER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_author_hash_unique" UNIQUE("author_hash")
);
--> statement-breakpoint
CREATE TABLE "auth"."workspace_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(30) DEFAULT 'MEMBER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(500),
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "meta"."datatype_properties" (
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
CREATE TABLE "meta"."object_properties" (
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
CREATE TABLE "meta"."ontology_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"system_key" varchar(100) NOT NULL,
	"display_names" jsonb NOT NULL,
	"descriptions" jsonb DEFAULT '{}'::jsonb,
	"parent_class_key" varchar(100),
	"status" varchar(20) DEFAULT 'PROPOSED' NOT NULL,
	"proposed_by" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_node_id" uuid NOT NULL,
	"target_node_id" uuid NOT NULL,
	"relation_key" varchar(100) NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"community_score" integer DEFAULT 0 NOT NULL,
	"author_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "edit_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"target_type" varchar(30) NOT NULL,
	"proposer_hash" varchar(64) NOT NULL,
	"proposed_changes" jsonb NOT NULL,
	"justification" text,
	"community_score" integer DEFAULT 0 NOT NULL,
	"status" varchar(30) DEFAULT 'PENDING' NOT NULL,
	"resolved_by" varchar(64),
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interactions_log" (
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
CREATE TABLE "nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type_key" varchar(100) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"attributes" jsonb DEFAULT '{}'::jsonb,
	"embedding" vector(768),
	"author_hash" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"community_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "social"."discussion_posts" (
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
CREATE TABLE "social"."discussion_threads" (
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
ALTER TABLE "auth"."workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."workspace_memberships" ADD CONSTRAINT "workspace_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta"."datatype_properties" ADD CONSTRAINT "datatype_properties_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta"."object_properties" ADD CONSTRAINT "object_properties_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta"."ontology_classes" ADD CONSTRAINT "ontology_classes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_source_node_id_nodes_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_target_node_id_nodes_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_proposals" ADD CONSTRAINT "edit_proposals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions_log" ADD CONSTRAINT "interactions_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."discussion_posts" ADD CONSTRAINT "discussion_posts_thread_id_discussion_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "social"."discussion_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."discussion_threads" ADD CONSTRAINT "discussion_threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_datatype_properties_domain_class" ON "meta"."datatype_properties" USING btree ("workspace_id","domain_class_key");--> statement-breakpoint
CREATE INDEX "idx_object_properties_domain_range" ON "meta"."object_properties" USING btree ("workspace_id","domain_class_key","range_class_key");--> statement-breakpoint
CREATE INDEX "idx_ontology_classes_workspace_key" ON "meta"."ontology_classes" USING btree ("workspace_id","system_key");--> statement-breakpoint
CREATE INDEX "idx_edges_workspace_status" ON "edges" USING btree ("workspace_id","status") WHERE "edges"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_edges_source" ON "edges" USING btree ("source_node_id");--> statement-breakpoint
CREATE INDEX "idx_edges_target" ON "edges" USING btree ("target_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_user_target_vote" ON "interactions_log" USING btree ("user_hash","target_id","target_type");--> statement-breakpoint
CREATE INDEX "idx_interactions_target" ON "interactions_log" USING btree ("target_id","target_type");--> statement-breakpoint
CREATE INDEX "idx_nodes_embedding_hnsw" ON "nodes" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX "idx_nodes_workspace_status" ON "nodes" USING btree ("workspace_id","status") WHERE "nodes"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_nodes_attributes_gin" ON "nodes" USING gin ("attributes");--> statement-breakpoint
CREATE INDEX "idx_discussion_posts_thread" ON "social"."discussion_posts" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_discussion_posts_parent" ON "social"."discussion_posts" USING btree ("parent_post_id");--> statement-breakpoint
CREATE INDEX "idx_discussion_threads_target" ON "social"."discussion_threads" USING btree ("target_id","target_type");--> statement-breakpoint
CREATE INDEX "idx_discussion_threads_workspace" ON "social"."discussion_threads" USING btree ("workspace_id","status");