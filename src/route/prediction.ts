import { Hono } from "hono";
import { PredictionService } from "../service";

const app = new Hono();

app.get("/models", async (c) => {
  return c.json(await PredictionService.getModels());
});

export default app;
