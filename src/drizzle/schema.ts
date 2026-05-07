import {
  boolean,
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
  tokens: integer("tokens").notNull().default(1000),
  creator: text("creator").notNull(),
  paused: boolean("paused").notNull().default(false),
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

export const executionSchedule = pgTable("execution_schedule", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id")
    .notNull()
    .references(() => model.id, { onDelete: "cascade" }),
  scheduledFor: timestamp("scheduled_for", {
    withTimezone: true
  }).notNull(),
  executedAt: timestamp("executed_at", {
    withTimezone: true
  }),
  createdAt: timestamp("created_at", {
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

export const history = pgTable(
  "history",
  {
    id: serial("id").primaryKey(),
    modelId: integer("model_id")
      .notNull()
      .references(() => model.id, { onDelete: "cascade" }),
    content: json("content").notNull(),
    tool: text("tool").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", {
      withTimezone: true
    })
      .defaultNow()
      .notNull()
  },
  (table) => [
    index("historyEmbeddingIndex").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    )
  ]
);

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
  isCorrect: boolean("is_correct"),
  sources: json("sources").$type<string[]>().notNull(),
  outcomeSources: json("outcome_sources")
    .$type<string[]>()
    .notNull()
    .default([]),
  outcomeReasoning: text("outcome_reasoning"),
  lastTaxedAt: timestamp("last_taxed_at", {
    withTimezone: true
  }),
  createdAt: timestamp("created_at", {
    withTimezone: true
  })
    .defaultNow()
    .notNull()
});

export const chatHistory = pgTable("chat_history", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  modelId: integer("model_id")
    .notNull()
    .references(() => model.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  tool: text("tool"),
  createdAt: timestamp("created_at", {
    withTimezone: true
  })
    .defaultNow()
    .notNull()
});

export const modelStrategy = pgTable("model_strategy", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id")
    .notNull()
    .references(() => model.id, { onDelete: "cascade" }),
  strategy: text("strategy").notNull(),
  rationale: text("rationale").notNull(),
  isActive: boolean("is_active").notNull().default(true),
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
