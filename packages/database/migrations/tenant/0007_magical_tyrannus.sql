ALTER TABLE "meta"."datatype_properties" ADD COLUMN "community_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meta"."object_properties" ADD COLUMN "community_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meta"."ontology_classes" ADD COLUMN "community_score" integer DEFAULT 0 NOT NULL;