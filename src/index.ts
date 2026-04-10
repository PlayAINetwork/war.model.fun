import { Hono } from "hono";
import { cors } from "hono/cors";
import { NewsRouter, PredictionRouter } from "./route";
import { serveStatic } from "hono/bun";

const app = new Hono();

app.use("/static/*", serveStatic({ root: "./src/" }));

app.use(cors());

app.route("/news", NewsRouter);
app.route("/prediction", PredictionRouter);

export default app;
