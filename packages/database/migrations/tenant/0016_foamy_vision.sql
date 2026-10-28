DROP INDEX "auth"."uniq_memberships_workspace_user";--> statement-breakpoint
ALTER TABLE "auth"."users" ADD COLUMN "handle" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_memberships_workspace_user_role" ON "auth"."workspace_memberships" USING btree ("workspace_id","user_id","role");--> statement-breakpoint
ALTER TABLE "auth"."users" ADD CONSTRAINT "users_handle_unique" UNIQUE("handle");