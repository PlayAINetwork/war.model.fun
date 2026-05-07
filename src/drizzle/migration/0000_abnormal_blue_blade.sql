CREATE TYPE "public"."provider" AS ENUM('openrouter');--> statement-breakpoint
CREATE TABLE "chat_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"model_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" integer NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "history" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" integer NOT NULL,
	"content" json NOT NULL,
	"tool" text NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"provider" "provider" NOT NULL,
	"provider_model_id" text NOT NULL,
	"image" text NOT NULL,
	"tokens" integer DEFAULT 1000 NOT NULL,
	"creator" text NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"last_run_at" json DEFAULT '{}'::json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_strategy" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" integer NOT NULL,
	"strategy" text NOT NULL,
	"rationale" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"category" text NOT NULL,
	"content" text,
	"summary" text,
	"embedding" vector(1536),
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" integer NOT NULL,
	"prediction" text NOT NULL,
	"reasoning" text NOT NULL,
	"happens_before" timestamp with time zone NOT NULL,
	"confidence" integer NOT NULL,
	"embedding" vector(1536),
	"is_correct" boolean,
	"sources" json NOT NULL,
	"outcome_sources" json DEFAULT '[]'::json NOT NULL,
	"outcome_reasoning" text,
	"last_taxed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_history" ADD CONSTRAINT "chat_history_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_schedule" ADD CONSTRAINT "execution_schedule_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history" ADD CONSTRAINT "history_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_strategy" ADD CONSTRAINT "model_strategy_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "historyEmbeddingIndex" ON "history" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "embeddingIndex" ON "news" USING hnsw ("embedding" vector_cosine_ops);