import { Hono } from "hono";
import { cors } from "hono/cors";
import { NewsRouter, PredictionRouter } from "./route";

const app = new Hono();
app.use(cors());

app.route("/news", NewsRouter);
app.route("/prediction", PredictionRouter);

export default app;
