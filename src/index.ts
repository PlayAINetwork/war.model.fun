import { Hono } from "hono";
import { cors } from "hono/cors";
import { NewsRouter, PredictionRouter, UIRouter } from "./route";
import { serveStatic } from "hono/bun";
import env from "./env";
import { showRoutes } from "hono/dev";
import { HTTPException } from "hono/http-exception";

const app = new Hono();

app.use("/static/*", serveStatic({ root: "./src/" }));

app.use(cors());

app.route("/", UIRouter);
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

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    c.status(err.status);
    return c.json({
      message: err.message
    });
  }

  console.error(err);

  c.status(500);

  return c.json({
    message: "Internal Server Error"
  });
});

if (env.NODE_ENV === "local") {
  showRoutes(app);
}

export default app;
