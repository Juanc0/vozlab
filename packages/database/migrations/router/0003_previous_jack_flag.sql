CREATE TABLE "global_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuer" varchar(512) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_global_identities_issuer_subject" ON "global_identities" USING btree ("issuer","subject");