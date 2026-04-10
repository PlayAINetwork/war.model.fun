import { Hono } from "hono";
import { cors } from "hono/cors";
import { NewsRouter, PredictionRouter } from "./route";
import { serveStatic } from "hono/bun";
import env from "./env";
import { showRoutes } from "hono/dev";

const app = new Hono();

app.use("/static/*", serveStatic({ root: "./src/" }));

app.use(cors());

app.route("/news", NewsRouter);
app.route("/prediction", PredictionRouter);

app.get("/api/*", async (c) => {
  const path = c.req.path.replace(/^\/api/, "");
  const search = new URL(c.req.url).search;
  const url = `https://api.worldmonitor.app/api${path}${search}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      origin: "https://www.worldmonitor.app"
    }
  });

  const data = await response.json();

  return c.json(data);
});

if (env.NODE_ENV === "local") {
  showRoutes(app);
}

export default app;
