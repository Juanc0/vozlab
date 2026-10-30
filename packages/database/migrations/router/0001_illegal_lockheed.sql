ALTER TABLE "global_users" ADD COLUMN "email_hash" varchar(64);--> statement-breakpoint
CREATE INDEX "idx_global_users_email_hash" ON "global_users" USING btree ("email_hash");--> statement-breakpoint
ALTER TABLE "global_users" DROP COLUMN "email";