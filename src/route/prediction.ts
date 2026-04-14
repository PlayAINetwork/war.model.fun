import { Hono } from "hono";
import { PredictionService } from "../service";
import { zValidator } from "@hono/zod-validator";
import { paginationSchema } from "../util";
import { z } from "zod";

const app = new Hono();

app.get("/models", async (c) => {
  return c.json(await PredictionService.getModels());
});

app.get(
  "/history",
  zValidator(
    "query",
    paginationSchema.extend({ id: z.coerce.number().optional() })
  ),
  async (c) => {
    const { page, limit, id } = c.req.valid("query");
    return c.json(
      await PredictionService.getModelHistory({ modelId: id, page, limit })
    );
  }
);

app.get(
  "/insights",
  zValidator(
    "query",
    paginationSchema.extend({ id: z.coerce.number().optional() })
  ),
  async (c) => {
    const { page, limit, id } = c.req.valid("query");
    return c.json(
      await PredictionService.getModelHistory({
        modelId: id,
        page,
        limit,
        onlyInsights: true
      })
    );
  }
);

app.get(
  "/execution-reasoning",
  zValidator(
    "query",
    paginationSchema.extend({ id: z.coerce.number().optional() })
  ),
  async (c) => {
    const { page, limit, id } = c.req.valid("query");
    return c.json(
      await PredictionService.getModelHistory({
        modelId: id,
        page,
        limit,
        onlyExecutionReasoning: true
      })
    );
  }
);

app.get(
  "/",
  zValidator(
    "query",
    paginationSchema.extend({ id: z.coerce.number().optional() })
  ),
  async (c) => {
    const { page, limit, id } = c.req.valid("query");
    return c.json(
      await PredictionService.getModelPredictions({ modelId: id, page, limit })
    );
  }
);

app.get(
  "/stats",
  zValidator("query", z.object({ id: z.coerce.number() })),
  async (c) => {
    const { id } = c.req.valid("query");
    return c.json(await PredictionService.getModelStats(id));
  }
);

export default app;
