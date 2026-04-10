import {
  index,
  integer,
  json,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  vector
} from "drizzle-orm/pg-core";

export const provider = pgEnum("provider", ["openrouter"]);

export const model = pgTable("model", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  provider: provider("provider").notNull(),
  providerModelId: text("provider_model_id").notNull(),
  image: text("image").notNull(),
  score: integer("score").notNull().default(0),
  maxScore: integer("max_score").notNull().default(0),
  creator: text("creator").notNull(),
  lastRunAt: json("last_run_at").$type<Record<string, string>>().default({}),
  createdAt: timestamp("created_at", {
    withTimezone: true
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true
  })
    .defaultNow()
    .notNull()
});

export const news = pgTable(
  "news",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    url: text("url").notNull().unique(),
    category: text("category").notNull(),
    content: text("content"),
    summary: text("summary"),
    embedding: vector("embedding", { dimensions: 1536 }),
    publishedAt: timestamp("published_at", {
      withTimezone: true
    })
      .defaultNow()
      .notNull()
  },
  (table) => [
    index("embeddingIndex").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    )
  ]
);

export const history = pgTable("history", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id")
    .notNull()
    .references(() => model.id, { onDelete: "cascade" }),
  content: json("content").notNull(),
  tool: text("tool").notNull(),
  createdAt: timestamp("created_at", {
    withTimezone: true
  })
    .defaultNow()
    .notNull()
});

export const predictions = pgTable("predictions", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id")
    .notNull()
    .references(() => model.id, { onDelete: "cascade" }),
  prediction: text("prediction").notNull(),
  reasoning: text("reasoning").notNull(),
  happensBefore: timestamp("happens_before", {
    withTimezone: true
  }).notNull(),
  confidence: integer("confidence").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  isCorrect: integer("is_correct"),
  sources: json("sources").$type<string[]>().notNull(),
  outcomeSources: json("outcome_sources")
    .$type<string[]>()
    .notNull()
    .default([]),
  outcomeReasoning: text("outcome_reasoning"),
  createdAt: timestamp("created_at", {
    withTimezone: true
  })
    .defaultNow()
    .notNull()
});
