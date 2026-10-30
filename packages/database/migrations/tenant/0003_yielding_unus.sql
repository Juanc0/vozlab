ALTER TABLE "auth"."workspace_join_codes" ADD COLUMN "purpose" varchar(12) DEFAULT 'WORKSPACE' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."workspace_join_codes" ADD CONSTRAINT "workspace_join_codes_purpose_check" CHECK ("auth"."workspace_join_codes"."purpose" IN ('WORKSPACE', 'EVENT'));--> statement-breakpoint
COMMENT ON COLUMN "auth"."workspace_join_codes"."purpose" IS 'DEC-3 credential separation: WORKSPACE rows redeem only through the authenticated join path, EVENT rows only through the anonymous QR join path — one mechanism, two credential classes (ADR-0046)';
