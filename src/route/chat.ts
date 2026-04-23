import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { paginationSchema } from "../util";
import { getChatHistory, getChatResponse, resetChatHistory } from "../service/chat";
import { streamSSE } from "hono/streaming";

const app = new Hono();

app.get(
  "/history",
  zValidator(
    "query",
    paginationSchema.extend({ modelId: z.coerce.number(), userId: z.string() })
  ),
  async (c) => {
    const { modelId, userId, page, limit } = c.req.valid("query");
    return c.json(await getChatHistory(userId, modelId, page, limit));
  }
);

app.post(
  "/reset",
  zValidator("json", z.object({ modelId: z.number(), userId: z.string() })),
  async (c) => {
    const { modelId, userId } = c.req.valid("json");
    await resetChatHistory(userId, modelId);
    return c.json({ success: true });
  }
);

app.post(
  "/stream",
  zValidator(
    "json",
    z.object({
      modelId: z.number(),
      userId: z.string(),
      message: z.string(),
      accessCode: z.string()
    })
  ),
  async (c) => {
    const { modelId, userId, message, accessCode } = c.req.valid("json");

    if (accessCode !== "SIG-DNSH") {
      c.status(401);
      return c.json({ error: "Unauthorized: Invalid Access Code" });
    }

    return streamSSE(c, async (stream) => {
      const responseStream = getChatResponse({ userId, modelId, message });

      for await (const chunk of responseStream) {
        await stream.writeSSE({
          data: JSON.stringify(chunk)
        });
      }
    });
  }
);

export default app;
