DROP INDEX "auth"."uniq_users_provider_provider_user";--> statement-breakpoint
ALTER TABLE "auth"."users" DROP COLUMN "provider_user_id";--> statement-breakpoint
ALTER TABLE "auth"."users" DROP COLUMN "is_anonymous";