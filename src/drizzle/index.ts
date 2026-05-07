import * as schema from "./schema";
import env from "../env";
import { Pool } from "pg";
import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { PgTransaction } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";

const client = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.MAX_CONNECTIONS
});

export { schema };

export type Tx = PgTransaction<
  NodePgQueryResultHKT,
  Record<string, never>,
  ExtractTablesWithRelations<Record<string, never>>
>;

export default drizzle({
  client
});
