import db, { schema } from "../drizzle";
import { and, count, desc, eq } from "drizzle-orm";
import { openrouter } from "@openrouter/ai-sdk-provider";

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
  page = 1
}: {
  modelId?: number;
  limit?: number;
  page?: number;
}) {
  const offset = (page - 1) * limit;

  const condition = modelId
    ? eq(schema.predictions.modelId, modelId)
    : undefined;

  const [data, [total]] = await Promise.all([
    db
      .select()
      .from(schema.predictions)
      .where(condition)
      .orderBy(desc(schema.predictions.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(schema.predictions).where(condition)
  ]);

  return {
    data: data.map(({ embedding, ...rest }) => rest),
    pagination: {
      page,
      limit,
      total: total!.total
    }
  };
}
