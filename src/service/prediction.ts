import db, { schema } from "../drizzle";
import { desc } from "drizzle-orm";

export async function getModels() {
  const models = await db
    .select({
      id: schema.model.id,
      name: schema.model.name,
      creator: schema.model.creator,
      score: schema.model.score,
      maxScore: schema.model.maxScore,
      image: schema.model.image
    })
    .from(schema.model)
    .orderBy(desc(schema.model.score));

  return models.map((m) => ({
    ...m,
    accuracy:
      m.maxScore > 0 ? (((m.score || 0) / m.maxScore) * 100).toFixed(2) : "N/A"
  }));
}
