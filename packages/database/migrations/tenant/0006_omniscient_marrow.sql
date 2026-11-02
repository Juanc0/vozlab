ALTER TABLE "meta"."datatype_properties" ADD COLUMN "migration_target_key" varchar(100);--> statement-breakpoint
ALTER TABLE "meta"."object_properties" ADD COLUMN "migration_target_key" varchar(100);--> statement-breakpoint
ALTER TABLE "meta"."ontology_classes" ADD COLUMN "migration_target_key" varchar(100);