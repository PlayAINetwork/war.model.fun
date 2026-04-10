const { DATABASE_URL, MAX_CONNECTIONS, OPENROUTER_API_KEY, NODE_ENV } =
  process.env;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not defined");
}

if (!OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY environment variable is not defined");
}

export default {
  NODE_ENV: NODE_ENV || "development",
  DATABASE_URL,
  OPENROUTER_API_KEY,
  MAX_CONNECTIONS: (MAX_CONNECTIONS && parseInt(MAX_CONNECTIONS)) || 20
};
