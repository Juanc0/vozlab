ALTER TABLE "auth"."workspaces" DROP CONSTRAINT "workspaces_join_code_unique";--> statement-breakpoint
ALTER TABLE "auth"."workspace_join_codes" ADD COLUMN "created_by_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "auth"."workspace_join_codes" DROP COLUMN "created_by";--> statement-breakpoint
ALTER TABLE "auth"."workspaces" DROP COLUMN "auto_approve_join_code";--> statement-breakpoint
ALTER TABLE "auth"."workspaces" DROP COLUMN "join_code";--> statement-breakpoint
COMMENT ON COLUMN "auth"."workspace_join_codes"."created_by_hash" IS 'ADR-0013 pseudonym of the creator';