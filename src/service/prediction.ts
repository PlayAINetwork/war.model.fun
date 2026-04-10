import db, { schema } from "../drizzle";
import { and, cosineDistance, count, desc, eq, sql } from "drizzle-orm";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { tool } from "ai";
import { z } from "zod";
import { createEmbeddings, getNews } from "./news";

const MODEL_PROVIDER = {
  openrouter: openrouter
};

export async function getModels() {
  const models = await db
    .select()
    .from(schema.model)
    .orderBy(desc(schema.model.score));

  return models.map((m) => ({
    ...m,
    accuracy:
      m.maxScore > 0 ? (((m.score || 0) / m.maxScore) * 100).toFixed(2) : "N/A"
  }));
}

export async function getModelHistory({
  modelId,
  limit = 20,
  page = 1,
  onlyInsights = false
}: {
  modelId?: number;
  limit?: number;
  page?: number;
  onlyInsights?: boolean;
}) {
  const offset = (page - 1) * limit;

  const conditions = [];
  if (modelId) conditions.push(eq(schema.history.modelId, modelId));
  if (onlyInsights) conditions.push(eq(schema.history.tool, "insight"));

  const condition = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, [total]] = await Promise.all([
    db
      .select()
      .from(schema.history)
      .where(condition)
      .orderBy(desc(schema.history.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(schema.history).where(condition)
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total: total!.total
    }
  };
}

export async function getModelPredictions({
  modelId,
  limit = 20,
  page = 1,
  search
}: {
  modelId?: number;
  limit?: number;
  page?: number;
  search?: string;
}) {
  const offset = (page - 1) * limit;

  let similarity: ReturnType<typeof sql<number>> | undefined;
  if (search) {
    const embedding = await createEmbeddings(search);
    similarity = sql<number>`1 - (${cosineDistance(schema.predictions.embedding, embedding)})`;
  }

  const modelClause = modelId
    ? eq(schema.predictions.modelId, modelId)
    : undefined;
  const searchClause = similarity ? sql`${similarity} > 0.5` : undefined;

  const condition = and(modelClause, searchClause) ?? undefined;

  const [data, [total]] = await Promise.all([
    db
      .select({
        id: schema.predictions.id,
        modelId: schema.predictions.modelId,
        prediction: schema.predictions.prediction,
        reasoning: schema.predictions.reasoning,
        happensBefore: schema.predictions.happensBefore,
        confidence: schema.predictions.confidence,
        isCorrect: schema.predictions.isCorrect,
        sources: schema.predictions.sources,
        outcomeSources: schema.predictions.outcomeSources,
        outcomeReasoning: schema.predictions.outcomeReasoning,
        createdAt: schema.predictions.createdAt,
        ...(similarity ? { similarity } : {})
      })
      .from(schema.predictions)
      .where(condition)
      .orderBy(
        similarity ? desc(similarity) : desc(schema.predictions.createdAt)
      )
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(schema.predictions).where(condition)
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total: total!.total
    }
  };
}

const getSimilarContent = tool({
  description: "Finds similar news articles based on the provided text",
  inputSchema: z.object({
    text: z.string().describe("The text to find similar news articles for")
  }),
  execute: async ({ text }) => {
    try {
      const results = await getNews({
        search: text
      });
      return {
        status: "success",
        data: results
      };
    } catch (e) {
      return {
        status: "error",
        message: `An error occurred while finding similar content: ${e}`
      };
    }
  }
});

const getSearchPredictionsTool = (modelName: string) =>
  tool({
    description:
      "Searches for relevant predictions based on the provided query",
    inputSchema: z.object({
      query: z.string().describe("The query to search predictions for")
    }),
    execute: async ({ query }) => {
      try {
        const results = await getModelPredictions({ search: query });
        return {
          status: "success",
          data: results
        };
      } catch (e) {
        return {
          status: "error",
          message: `An error occurred while searching predictions: ${e}`
        };
      }
    }
  });

const insight = tool({
  description:
    "Provides a very short summary and insight of the analysis (1-2 short sentences maximum). MUST be a definitive, one-shot standalone summary. DO NOT ask any follow-up questions.",
  inputSchema: z.object({
    title: z
      .string()
      .describe(
        "A very short title or summary for the insight (1 sentence max)"
      ),
    category: z.string().describe("The category of the news being analyzed"),
    insight: z
      .string()
      .describe(
        "The very short insight or summary, strictly 1-2 short sentences at max."
      ),
    chainOfThought: z
      .string()
      .describe(
        "A detailed internal thought process detailing your planning, evaluation of options, reasoning, and final plan. Format using headings and paragraphs (e.g., 'Initial Thoughts:', 'Reviewing Data:', 'Evaluating Edge:', 'Final Plan:', 'Important Details:'). Detail your step-by-step reasoning."
      )
  }),
  execute: async (data) => {
    return {
      status: "success",
      data
    };
  }
});
