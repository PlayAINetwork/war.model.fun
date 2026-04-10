import db, { schema } from "../drizzle";

export async function getModels() {
  return db.select().from(schema.model);
}
