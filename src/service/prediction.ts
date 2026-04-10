import db, { schema } from "../drizzle";
import { desc } from "drizzle-orm";

export async function getModels() {
  return db.select().from(schema.model).orderBy(desc(schema.model.score));
}
