ALTER TABLE "auth"."users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "auth"."invitations" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "auth"."users" DROP COLUMN "email";