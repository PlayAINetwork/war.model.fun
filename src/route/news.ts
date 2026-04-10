import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { paginationSchema } from "../util";
import { NewsService } from "../service";
import { z } from "zod";

const app = new Hono();

app.get(
  "/",
  zValidator(
    "query",
    paginationSchema.extend({ category: z.string().optional() })
  ),
  async (c) => {
    const { page, limit, category } = c.req.valid("query");
    return c.json(await NewsService.getNews({ page, limit, category }));
  }
);

app.get("/categories", async (c) => {
  return c.json(await NewsService.getCategories());
});

export default app;
