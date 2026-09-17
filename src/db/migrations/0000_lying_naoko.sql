CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'rejected', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."price_kind" AS ENUM('per_hour', 'per_session');--> statement-breakpoint
CREATE TYPE "public"."resource_kind" AS ENUM('seats', 'whole', 'sessions');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_code" text NOT NULL,
	"resource_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"period" "tstzrange" NOT NULL,
	"blocked_period" "tstzrange" NOT NULL,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"guests" integer DEFAULT 1 NOT NULL,
	"comment" text,
	"price_minor" integer NOT NULL,
	"telegram_message_id" bigint,
	"decided_by" bigint,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "bookings_public_code_unique" UNIQUE("public_code"),
	CONSTRAINT "bookings_guests_positive" CHECK ("bookings"."guests" > 0),
	CONSTRAINT "bookings_price_non_negative" CHECK ("bookings"."price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rate_limit_hits" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip_hash" text NOT NULL,
	"scope" text DEFAULT 'booking' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_closures" (
	"id" serial PRIMARY KEY NOT NULL,
	"resource_id" integer NOT NULL,
	"unit_id" integer,
	"period" "tstzrange" NOT NULL,
	"reason" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_hours" (
	"id" serial PRIMARY KEY NOT NULL,
	"resource_id" integer NOT NULL,
	"weekday" smallint NOT NULL,
	"opens_min" integer NOT NULL,
	"closes_min" integer NOT NULL,
	CONSTRAINT "resource_hours_resource_weekday_key" UNIQUE("resource_id","weekday"),
	CONSTRAINT "resource_hours_weekday_range" CHECK ("resource_hours"."weekday" between 0 and 6),
	CONSTRAINT "resource_hours_order" CHECK ("resource_hours"."closes_min" > "resource_hours"."opens_min")
);
--> statement-breakpoint
CREATE TABLE "resource_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"resource_id" integer NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "resource_units_resource_code_key" UNIQUE("resource_id","code")
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"kind" "resource_kind" NOT NULL,
	"title" text NOT NULL,
	"subtitle" text NOT NULL,
	"description" text NOT NULL,
	"unit_noun" text DEFAULT 'место' NOT NULL,
	"timezone" text DEFAULT 'Europe/Moscow' NOT NULL,
	"price_kind" "price_kind" NOT NULL,
	"price_minor" integer NOT NULL,
	"slot_step_min" integer NOT NULL,
	"min_duration_min" integer NOT NULL,
	"max_duration_min" integer NOT NULL,
	"buffer_min" integer DEFAULT 0 NOT NULL,
	"horizon_days" integer DEFAULT 30 NOT NULL,
	"min_lead_min" integer DEFAULT 120 NOT NULL,
	"hold_min" integer DEFAULT 30 NOT NULL,
	"min_guests" integer DEFAULT 1 NOT NULL,
	"max_guests" integer DEFAULT 1 NOT NULL,
	"asks_guests" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "resources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_unit_id_resource_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."resource_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_closures" ADD CONSTRAINT "resource_closures_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_closures" ADD CONSTRAINT "resource_closures_unit_id_resource_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."resource_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_hours" ADD CONSTRAINT "resource_hours_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_units" ADD CONSTRAINT "resource_units_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_resource_status_idx" ON "bookings" USING btree ("resource_id","status");--> statement-breakpoint
CREATE INDEX "bookings_created_idx" ON "bookings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rate_limit_hits_lookup_idx" ON "rate_limit_hits" USING btree ("ip_hash","scope","created_at");--> statement-breakpoint
CREATE INDEX "resource_closures_resource_idx" ON "resource_closures" USING btree ("resource_id");