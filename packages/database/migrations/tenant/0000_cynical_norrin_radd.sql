CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE SCHEMA "meta";
--> statement-breakpoint
CREATE SCHEMA "social";
--> statement-breakpoint
CREATE TABLE "auth"."external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"issuer" varchar(512) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"provider_kind" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" varchar(255),
	"email_hash" varchar(64),
	"role" varchar(30) DEFAULT 'MEMBER' NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "auth"."membership_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"invitation_id" uuid,
	"actor_type" varchar(30) NOT NULL,
	"actor_id" varchar(255),
	"action" varchar(50) NOT NULL,
	"before_role" varchar(30),
	"after_role" varchar(30),
	"reason" text,
	"request_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255),
	"handle" varchar(64),
	"full_name" varchar(255),
	"provider" varchar(50) NOT NULL,
	"provider_user_id" varchar(255),
	"author_hash" varchar(64) NOT NULL,
	"anonymous_alias" varchar(100),
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"system_role" varchar(30) DEFAULT 'USER' NOT NULL,
	"sessions_valid_after" timestamp with time zone,
	"global_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_handle_unique" UNIQUE("handle"),
	CONSTRAINT "users_author_hash_unique" UNIQUE("author_hash")
);
--> statement-breakpoint
CREATE TABLE "auth"."workspace_join_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"label" varchar(255),
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"auto_approve" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_join_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "auth"."workspace_join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"message" varchar(500),
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."workspace_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(30) DEFAULT 'MEMBER' NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(500),
	"is_public" boolean DEFAULT true NOT NULL,
	"kind" varchar(20) DEFAULT 'PRIVATE' NOT NULL,
	"auto_approve_join_code" boolean DEFAULT false NOT NULL,
	"join_code" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug"),
	CONSTRAINT "workspaces_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
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
	"kind" varchar(20) DEFAULT 'EDIT' NOT NULL,
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
	"embedding_model" text,
	"embedded_at" timestamp with time zone,
	"author_hash" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"merged_into_id" uuid,
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
ALTER TABLE "auth"."external_identities" ADD CONSTRAINT "external_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."invitations" ADD CONSTRAINT "invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."workspace_join_codes" ADD CONSTRAINT "workspace_join_codes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."workspace_join_requests" ADD CONSTRAINT "workspace_join_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."workspace_join_requests" ADD CONSTRAINT "workspace_join_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."workspace_join_requests" ADD CONSTRAINT "workspace_join_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."workspace_memberships" ADD CONSTRAINT "workspace_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta"."data_sources" ADD CONSTRAINT "data_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta"."datatype_properties" ADD CONSTRAINT "datatype_properties_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta"."object_properties" ADD CONSTRAINT "object_properties_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta"."ontology_classes" ADD CONSTRAINT "ontology_classes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_source_node_id_nodes_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_target_node_id_nodes_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_proposals" ADD CONSTRAINT "edit_proposals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions_log" ADD CONSTRAINT "interactions_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_merged_into_id_nodes_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."discussion_posts" ADD CONSTRAINT "discussion_posts_thread_id_discussion_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "social"."discussion_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."discussion_threads" ADD CONSTRAINT "discussion_threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "auth"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_external_identities_issuer_subject" ON "auth"."external_identities" USING btree ("issuer","subject");--> statement-breakpoint
CREATE INDEX "idx_external_identities_user_id" ON "auth"."external_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_invitations_workspace" ON "auth"."invitations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_invitations_status" ON "auth"."invitations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_membership_events_workspace" ON "auth"."membership_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_membership_events_user" ON "auth"."membership_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_membership_events_created" ON "auth"."membership_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_user" ON "auth"."refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_family" ON "auth"."refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_expires_at" ON "auth"."refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_users_global_user" ON "auth"."users" USING btree ("global_user_id") WHERE global_user_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_users_provider_provider_user" ON "auth"."users" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_join_codes_workspace" ON "auth"."workspace_join_codes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_join_requests_workspace_status" ON "auth"."workspace_join_requests" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "idx_join_requests_user" ON "auth"."workspace_join_requests" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_join_requests_pending_user_workspace" ON "auth"."workspace_join_requests" USING btree ("workspace_id","user_id") WHERE status = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_memberships_workspace_user_role" ON "auth"."workspace_memberships" USING btree ("workspace_id","user_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_data_sources_workspace_key" ON "meta"."data_sources" USING btree ("workspace_id","source_key");--> statement-breakpoint
CREATE INDEX "idx_data_sources_key" ON "meta"."data_sources" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "idx_datatype_properties_domain_class" ON "meta"."datatype_properties" USING btree ("workspace_id","domain_class_key");--> statement-breakpoint
CREATE INDEX "idx_object_properties_domain_range" ON "meta"."object_properties" USING btree ("workspace_id","domain_class_key","range_class_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_ontology_classes_workspace_key" ON "meta"."ontology_classes" USING btree ("workspace_id","system_key");--> statement-breakpoint
CREATE INDEX "idx_edges_workspace_status" ON "edges" USING btree ("workspace_id","status") WHERE "edges"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_edges_workspace_source_ranked" ON "edges" USING btree ("workspace_id","source_node_id","community_score" DESC NULLS FIRST,"created_at" DESC NULLS FIRST) WHERE "edges"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_edges_workspace_target_ranked" ON "edges" USING btree ("workspace_id","target_node_id","community_score" DESC NULLS FIRST,"created_at" DESC NULLS FIRST) WHERE "edges"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_user_target_vote" ON "interactions_log" USING btree ("user_hash","target_id","target_type");--> statement-breakpoint
CREATE INDEX "idx_interactions_target" ON "interactions_log" USING btree ("target_id","target_type");--> statement-breakpoint
CREATE INDEX "idx_nodes_embedding_hnsw" ON "nodes" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX "idx_nodes_workspace_status" ON "nodes" USING btree ("workspace_id","status") WHERE "nodes"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_nodes_workspace_created" ON "nodes" USING btree ("workspace_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "nodes"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_nodes_attributes_gin" ON "nodes" USING gin ("attributes");--> statement-breakpoint
CREATE INDEX "idx_discussion_posts_thread" ON "social"."discussion_posts" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_discussion_posts_parent" ON "social"."discussion_posts" USING btree ("parent_post_id");--> statement-breakpoint
CREATE INDEX "idx_discussion_threads_target" ON "social"."discussion_threads" USING btree ("target_id","target_type");--> statement-breakpoint
CREATE INDEX "idx_discussion_threads_workspace" ON "social"."discussion_threads" USING btree ("workspace_id","status");