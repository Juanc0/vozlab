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
ALTER TABLE "auth"."external_identities" ADD CONSTRAINT "external_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_external_identities_issuer_subject" ON "auth"."external_identities" USING btree ("issuer","subject");--> statement-breakpoint
CREATE INDEX "idx_external_identities_user_id" ON "auth"."external_identities" USING btree ("user_id");