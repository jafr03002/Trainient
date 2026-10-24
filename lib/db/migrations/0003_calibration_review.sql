CREATE TABLE "calibration_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"program_id" integer NOT NULL,
	"kind" text DEFAULT 'review' NOT NULL,
	"calibration_day" integer NOT NULL,
	"ill_or_injured" boolean,
	"nutrition_sustainable" integer,
	"nutrition_fits_schedule" text,
	"anything_changed" text,
	"notes" text,
	"checks" jsonb NOT NULL,
	"verdict" text NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"work_on" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exercise_swaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message_to_user" text NOT NULL,
	"next_program_id" integer,
	"resumed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workout_logs" ADD COLUMN "calibration_feedback" jsonb;