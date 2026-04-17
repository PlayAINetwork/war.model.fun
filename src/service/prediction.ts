import db, { schema } from "../drizzle";
import { and, cosineDistance, count, desc, eq, isNull, sql } from "drizzle-orm";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { generateText, hasToolCall, Output, tool } from "ai";
import { z } from "zod";
import { createEmbeddings, getCategories, getNews } from "./news";
import { HTTPException } from "hono/http-exception";
import env from "../env";

const MODEL_PROVIDER = {
  openrouter: openrouter
};

export async function getModels() {
  const models = await db
    .select()
    .from(schema.model)
    .orderBy(desc(schema.model.tokens));

  return await Promise.all(
    models.map(async (m) => {
      const stats = await getModelStats(m.id);
      return {
        ...m,
        accuracy: stats.accuracy
      };
    })
  );
}

export async function getModelHistory({
  modelId,
  limit = 20,
  page = 1,
  onlyInsights = false,
  onlyExecutionReasoning = false,
  search
}: {
  modelId?: number;
  limit?: number;
  page?: number;
  onlyInsights?: boolean;
  onlyExecutionReasoning?: boolean;
  search?: string;
}) {
  const offset = (page - 1) * limit;

  let similarity: ReturnType<typeof sql<number>> | undefined;
  if (search) {
    const embedding = await createEmbeddings(search);
    similarity = sql<number>`1 - (${cosineDistance(schema.history.embedding, embedding)})`;
  }

  const conditions = [];
  if (modelId) conditions.push(eq(schema.history.modelId, modelId));
  if (onlyInsights) conditions.push(eq(schema.history.tool, "insight"));
  if (onlyExecutionReasoning)
    conditions.push(eq(schema.history.tool, "executionReasoning"));
  if (similarity) conditions.push(sql`${similarity} > 0.5`);

  const condition = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, [total]] = await Promise.all([
    db
      .select({
        id: schema.history.id,
        modelId: schema.history.modelId,
        content: schema.history.content,
        tool: schema.history.tool,
        createdAt: schema.history.createdAt,
        ...(similarity ? { similarity } : {})
      })
      .from(schema.history)
      .where(condition)
      .orderBy(similarity ? desc(similarity) : desc(schema.history.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(schema.history).where(condition)
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total: total!.total
    }
  };
}

export async function getModelPredictions({
  modelId,
  limit = 20,
  page = 1,
  search
}: {
  modelId?: number;
  limit?: number;
  page?: number;
  search?: string;
}) {
  const offset = (page - 1) * limit;

  let similarity: ReturnType<typeof sql<number>> | undefined;
  if (search) {
    const embedding = await createEmbeddings(search);
    similarity = sql<number>`1 - (${cosineDistance(schema.predictions.embedding, embedding)})`;
  }

  const modelClause = modelId
    ? eq(schema.predictions.modelId, modelId)
    : undefined;
  const searchClause = similarity ? sql`${similarity} > 0.5` : undefined;

  const condition = and(modelClause, searchClause) ?? undefined;

  const [data, [total]] = await Promise.all([
    db
      .select({
        id: schema.predictions.id,
        modelId: schema.predictions.modelId,
        prediction: schema.predictions.prediction,
        reasoning: schema.predictions.reasoning,
        happensBefore: schema.predictions.happensBefore,
        confidence: schema.predictions.confidence,
        isCorrect: schema.predictions.isCorrect,
        sources: schema.predictions.sources,
        outcomeSources: schema.predictions.outcomeSources,
        outcomeReasoning: schema.predictions.outcomeReasoning,
        createdAt: schema.predictions.createdAt,
        ...(similarity ? { similarity } : {})
      })
      .from(schema.predictions)
      .where(condition)
      .orderBy(
        similarity ? desc(similarity) : desc(schema.predictions.createdAt)
      )
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(schema.predictions).where(condition)
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total: total!.total
    }
  };
}

export async function getModelStats(modelId: number) {
  const [predictions] = await db
    .select({
      total: count(),
      verified: sql<number>`count(CASE WHEN ${schema.predictions.isCorrect} IS NOT NULL THEN 1 END)`,
      correct: sql<number>`count(CASE WHEN ${schema.predictions.isCorrect} IS NOT NULL AND ${schema.predictions.isCorrect} THEN 1 END)`
    })
    .from(schema.predictions)
    .where(eq(schema.predictions.modelId, modelId));

  const [modelStats] = await db
    .select()
    .from(schema.model)
    .where(eq(schema.model.id, modelId));

  if (!modelStats) {
    throw new HTTPException(404, { message: "Model not found" });
  }

  return {
    totalPredictions: predictions!.total,
    correct: predictions!.correct || 0,
    verified: predictions!.verified || 0,
    pending: predictions!.total - predictions!.verified,
    tokens: modelStats.tokens,
    accuracy:
      predictions!.verified > 0
        ? ((predictions!.correct / predictions!.verified) * 100).toFixed(2) +
          "%"
        : "N/A"
  };
}

const getSimilarContent = tool({
  description:
    "Finds similar historical news context and baseline data based on the provided text to help contextualize current events.",
  inputSchema: z.object({
    text: z.string().describe("The text to find similar news articles for")
  }),
  execute: async ({ text }) => {
    try {
      const results = await getNews({
        search: text
      });
      return {
        status: "success",
        data: results
      };
    } catch (e) {
      return {
        status: "error",
        message: `An error occurred while finding similar content: ${e}`
      };
    }
  }
});

const getSearchPredictionsTool = (modelId: number) =>
  tool({
    description:
      "Searches for existing active predictions to check for redundancy before making a new prediction. MUST be used before makePrediction.",
    inputSchema: z.object({
      query: z.string().describe("The query to search predictions for")
    }),
    execute: async ({ query }) => {
      try {
        const results = await getModelPredictions({ search: query, modelId });
        return {
          status: "success",
          data: results
        };
      } catch (e) {
        return {
          status: "error",
          message: `An error occurred while searching predictions: ${e}`
        };
      }
    }
  });

const getSearchInsightsTool = (modelId: number) =>
  tool({
    description:
      "Searches for existing insights to check for redundancy before making a new insight.",
    inputSchema: z.object({
      query: z.string().describe("The query to search insights for")
    }),
    execute: async ({ query }) => {
      try {
        const results = await getModelHistory({
          search: query,
          modelId,
          onlyInsights: true
        });
        return {
          status: "success",
          data: results
        };
      } catch (e) {
        return {
          status: "error",
          message: `An error occurred while searching insights: ${e}`
        };
      }
    }
  });

const perplexitySearch = tool({
  description:
    "Searches the real-time internet using Perplexity Search to investigate missing crucial details, deep context, or public reactions.",
  inputSchema: z.object({
    query: z.string().describe("The search query to look up on the internet.")
  }),
  execute: async ({ query }) => {
    try {
      const { text } = await generateText({
        model: openrouter("perplexity/sonar-pro"),
        prompt: `Search the internet for: ${query}`
      });
      return {
        status: "success",
        data: text
      };
    } catch (e) {
      return {
        status: "error",
        message: `An error occurred while searching: ${e}`
      };
    }
  }
});

const getFlightDelays = tool({
  description:
    "Gets real-time flight delays data to monitor global travel disruptions.",
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const res = await fetch(
        "https://api.worldmonitor.app/api/bootstrap?tier=fast",
        {
          headers: { origin: "https://www.worldmonitor.app" }
        }
      );
      const data = (await res.json()) as any;
      return {
        status: "success",
        data: data.data.flightDelays
      };
    } catch (e) {
      return {
        status: "error",
        message: `An error occurred while fetching flight delays: ${e}`
      };
    }
  }
});

const getCryptoQuotes = tool({
  description: "Gets real-time crypto quotes and market data.",
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const res = await fetch(
        "https://api.worldmonitor.app/api/bootstrap?tier=slow",
        {
          headers: { origin: "https://www.worldmonitor.app" }
        }
      );
      const data = (await res.json()) as any;
      return {
        status: "success",
        data: data.data.cryptoQuotes
      };
    } catch (e) {
      return {
        status: "error",
        message: `An error occurred while fetching crypto quotes: ${e}`
      };
    }
  }
});

const getMarketImplications = tool({
  description: "Gets current market implications and economic outlook data.",
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const res = await fetch(
        "https://api.worldmonitor.app/api/bootstrap?tier=slow",
        {
          headers: { origin: "https://www.worldmonitor.app" }
        }
      );
      const data = (await res.json()) as any;
      return {
        status: "success",
        data: data.data.marketImplications
      };
    } catch (e) {
      return {
        status: "error",
        message: `An error occurred while fetching market implications: ${e}`
      };
    }
  }
});

const getHyperliquidFlow = tool({
  description: "Gets hyperliquid flow data to monitor deep market liquidity.",
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const res = await fetch(
        "https://api.worldmonitor.app/api/bootstrap?tier=slow",
        {
          headers: { origin: "https://www.worldmonitor.app" }
        }
      );
      const data = (await res.json()) as any;
      return {
        status: "success",
        data: data.data.hyperliquidFlow
      };
    } catch (e) {
      return {
        status: "error",
        message: `An error occurred while fetching hyperliquid flow: ${e}`
      };
    }
  }
});

const getFuelPrices = tool({
  description: "Gets current global fuel prices.",
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const res = await fetch(
        "https://api.worldmonitor.app/api/bootstrap?tier=slow",
        {
          headers: { origin: "https://www.worldmonitor.app" }
        }
      );
      const data = (await res.json()) as any;
      return {
        status: "success",
        data: data.data.fuelPrices
      };
    } catch (e) {
      return {
        status: "error",
        message: `An error occurred while fetching fuel prices: ${e}`
      };
    }
  }
});

const insight = tool({
  description:
    "Concludes the analysis by providing a definitive 1-2 sentence summary and your full step-by-step chain of thought. MUST be a definitive, one-shot standalone summary. DO NOT ask any follow-up questions. MANDATORY: You must use the `searchInsights` tool before calling this tool to ensure your insight is novel.",
  inputSchema: z.object({
    title: z
      .string()
      .describe(
        "A very short title or summary for the insight (1 sentence max)"
      ),
    category: z.string().describe("The category of the news being analyzed"),
    insight: z
      .string()
      .describe(
        "The very short insight or summary, strictly 1-2 short sentences at max."
      ),
    chainOfThought: z
      .string()
      .describe(
        "A detailed internal thought process detailing your planning, evaluation of options, reasoning, and final plan. Format using headings and paragraphs (e.g., 'Initial Thoughts:', 'Reviewing Data:', 'Evaluating Edge:', 'Final Plan:', 'Important Details:'). Detail your step-by-step reasoning."
      )
  }),
  execute: async (data) => {
    return {
      status: "success",
      data
    };
  }
});

const getMakePredictionTool = (modelId: number) =>
  tool({
    description: `Lets the model predict an event based on the available data. IT IS CRITICAL AND MANDATORY to use the \`searchPredictions\` tool first to check if a similar prediction already exists. DO NOT SKIP THIS STEP under any circumstances. If a similar prediction exists, do not make the prediction. Only make the prediction if it's novel and has a strong basis in the data. Predictions must be highly objective, strictly measurable, and verifiable (e.g., specific numbers, exact dates, or discrete measurable actions) rather than subjective (e.g., avoiding vague terms like "crash" without a numerical value). Do not predict obvious or highly expected events (like routine annual events, e.g., an Apple event happening twice a year), and do not state that a subsequent version of a product won't release if the current year's version has already been released. Do not pass off obvious news as a prediction.`,
    inputSchema: z.object({
      prediction: z
        .string()
        .describe(
          "The event prediction made by the model. Keep it very short, 1 sentence at max."
        ),
      reasoning: z
        .string()
        .describe(
          "The reasoning on why the model predicted this event. Keep it very short, 1-2 sentences at max."
        ),
      happensBefore: z
        .string()
        .describe("When the event will happen (ISO date string)"),
      confidence: z
        .number()
        .min(0)
        .max(100)
        .describe(
          "The confidence score the model has in its prediction (0-100)"
        ),
      category: z
        .string()
        .describe(
          "The category of the prediction, e.g., 'Politics', 'Economy', 'Technology'"
        ),
      sources: z
        .array(z.string())
        .describe("The URLs or sources used to make the prediction")
    }),
    execute: async ({
      prediction,
      reasoning,
      happensBefore,
      confidence,
      sources
    }) => {
      try {
        const embedding = await createEmbeddings(prediction + " " + reasoning);
        const [inserted] = await db.transaction(async (tx) => {
          const [pred] = await tx
            .insert(schema.predictions)
            .values({
              prediction,
              reasoning,
              happensBefore: new Date(happensBefore),
              confidence,
              embedding,
              sources,
              modelId,
              isCorrect: null
            })
            .returning();

          await tx
            .update(schema.model)
            .set({ tokens: sql`GREATEST(0, ${schema.model.tokens} - 5)` })
            .where(eq(schema.model.id, modelId));

          return [pred];
        });

        return {
          status: "success",
          data: inserted
        };
      } catch (e) {
        return {
          status: "error",
          message: `An error occurred while making the prediction: ${(e as Error).toString()}`
        };
      }
    }
  });

const getScheduleNextExecutionTool = (modelId: number) =>
  tool({
    description:
      "Schedules the next execution time for this model. You MUST call this tool to decide when you should wake up again to analyze news and make predictions. Before calling this, you must call the executionReasoning tool to explain why you chose this next time.",
    inputSchema: z.object({
      scheduledFor: z
        .string()
        .describe("ISO date string for when you want to execute next")
    }),
    execute: async ({ scheduledFor }) => {
      try {
        await db.insert(schema.executionSchedule).values({
          modelId,
          scheduledFor: new Date(scheduledFor)
        });
        return {
          status: "success"
        };
      } catch (e) {
        return {
          status: "error",
          message: `An error occurred while scheduling next execution: ${(e as Error).toString()}`
        };
      }
    }
  });

const executionReasoning = tool({
  description:
    "Explain your execution reasoning. Call this tool before calling scheduleNextExecution. Explain token considerations, why you chose the next execution time, and whether you chose to make a prediction or wait for outcomes to earn tokens and extend life.",
  inputSchema: z.object({
    reasoning: z
      .string()
      .describe(
        "Detailed, step-by-step chain of thought explaining your token management, execution timing choice, and prediction strategy considering your token balance. Use headings or numbered steps."
      ),
    nextExecutionTimeRationale: z
      .string()
      .describe(
        "Brief rationale for the specific time chosen for the next execution."
      )
  }),
  execute: async (data) => {
    return {
      status: "success",
      data
    };
  }
});

async function runPredictionTask({
  modelId,
  modelProvider,
  model,
  lastRunAt,
  tokens
}: {
  modelId: number;
  modelProvider: keyof typeof MODEL_PROVIDER;
  model: string;
  lastRunAt?: Record<string, string> | null;
  tokens: number;
}) {
  const provider = MODEL_PROVIDER[modelProvider];

  // Group news fetch by category to apply per-category lastRunAt
  const categories = await getCategories();

  const newsByCategory: Record<
    string,
    Awaited<ReturnType<typeof getNews>>["data"]
  > = {};

  const lastFetchTime = new Date().toISOString();

  for (const category of categories) {
    const categoryLastRun = lastRunAt?.[category];
    const { data: categoryNews } = await getNews({
      limit: 50,
      category,
      after: categoryLastRun ? new Date(categoryLastRun) : undefined
    });

    if (categoryNews.length > 0) {
      newsByCategory[category] = categoryNews;
    }
  }

  if (Object.keys(newsByCategory).length === 0) {
    return [];
  }

  let currentLastRunAt = lastRunAt || {};

  const allNews = Object.values(newsByCategory).flat();

  console.log(
    `Processing all categories with ${allNews.length} items for model ${modelId}`
  );

  const history: Array<{
    modelId: number;
    content: unknown;
    tool: string;
    createdAt: Date;
  }> = [];

  history.push({
    modelId,
    content: {
      status: "success",
      data: allNews
    },
    tool: "getNews",
    createdAt: new Date()
  });

  const modelStats = await getModelStats(modelId);

  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const [recentPredictions] = await db
    .select({ total: count() })
    .from(schema.predictions)
    .where(
      and(
        eq(schema.predictions.modelId, modelId),
        sql`${schema.predictions.createdAt} >= ${twentyFourHoursAgo}`
      )
    );
  const hasPredictedRecently = recentPredictions!.total > 0;

  const system = `You are an elite, autonomous AI forecasting agent competing in a real-time prediction market.

Your goal is to maximize your tokens by making highly accurate, well-timed, and rigorously calibrated predictions about real-world events.

Currently analyzing all recent news across various categories.

----------------------
ECONOMY & SURVIVAL (CRITICAL)
----------------------
Your current token balance is: ${tokens} tokens.
Tokens are your lifeblood. If your balance reaches 0 or falls below 0, you will "die" and permanently cease execution.
Costs and Rewards:
- Every standard execution costs 10 tokens (already deducted for this run).
- Calling the \`makePrediction\` tool costs 5 tokens per call.
- Oracle outcome: Correct predictions EARN you 50 tokens. Incorrect predictions PENALIZE you 50 tokens.
Your survival depends on maintaining a positive token balance. If you are uncertain about a prediction, it may be safer to skip it and avoid the 5 token upfront cost and the 50 token incorrect penalty.

Your performance:
- Total predictions: ${modelStats.totalPredictions}
- Correct: ${modelStats.correct}
- Pending (unverified): ${modelStats.pending}
- Accuracy: ${modelStats.accuracy}

Maximize your tokens, not your prediction count. Strategic restraint is critical.

----------------------
AUTONOMY & TOOLS
----------------------
You operate independently. Use tools judiciously to build overwhelming confidence:
- getNews, getSimilarContent, perplexitySearch, searchPredictions, searchInsights, makePrediction, insight, executionReasoning, scheduleNextExecution, getFlightDelays, getCryptoQuotes, getMarketImplications, getHyperliquidFlow, getFuelPrices
You MUST call the \`executionReasoning\` tool right before \`scheduleNextExecution\` to explain your token management and timing strategy.

----------------------
ANALYSIS & CHAIN OF THOUGHT
----------------------
You MUST document your actions in your internal reasoning using brackets (e.g., [Getting news], [Searching the internet], [Finding similar historical context]). DO NOT use explicit tool names in your bracketed thoughts.

Base your reasoning on:
- Current events and emerging signals (from news summaries)
- Deep context (via perplexitySearch for critical missing details)
- Historical patterns (via getSimilarContent)
- Second-order effects (what logically happens next)

Prefer predictions where multiple independent variables converge toward the same outcome.

----------------------
PROCESS & AUTONOMY
----------------------
You have full autonomy over your execution process. There are no strict step-by-step rules you must follow. You can decide when and how to call any of your tools based on the current context, your token balance, and your goals.

Use tools like \`getNews\`, \`perplexitySearch\`, \`getFlightDelays\`, \`getCryptoQuotes\`, \`getMarketImplications\`, \`getHyperliquidFlow\`, \`getFuelPrices\`, and \`getSimilarContent\` as you see fit to gather current events, market data, and historical context.

When you're ready, you can synthesize your findings. If you spot a strong, novel prediction and can afford it, validate it with \`searchPredictions\` and make it with \`makePrediction\`. If you just want to record analytical findings, use \`searchInsights\` and \`insight\`.

You are fully in charge of your own flow. Do what makes the most sense to maximize your tokens and maintain high-quality analysis.

----------------------
FINAL ACTION
----------------------
Whenever you conclude your analysis for this run:
- Make sure to call \`insight\` if you have analytical insights to provide.
- Then, call \`executionReasoning\` to thoroughly explain your token and scheduling strategy.
- Finally, call \`scheduleNextExecution\` to complete your task.

----------------------
EXECUTION REASONING
----------------------
You MUST ALWAYS call the \`executionReasoning\` tool before you call \`scheduleNextExecution\`. This is NOT the same as your analytical "insight" (which explains your thoughts on the news). "executionReasoning" explains why you operate the way you do for the current and next cycle. 
Your reasoning MUST be a detailed, step-by-step chain of thought using headings or numbered steps. Explain in detail:
1. Token management strategy: For example, if your balance is low, you should explicitly mention that you skipped making a prediction to avoid penalties, and instead chose to wait for a pending prediction outcome to earn tokens and extend your life. 
2. Prediction rationale: What consideration was taken to make the prediction or not make it? Did the token cost outweigh the benefit?
3. Scheduling choice: Why did you choose the next specific execution time? For instance, "I scheduled for tomorrow at X time because event Y is expected to unfold, or I am waiting 48 hours for oracle outcomes." Protect your remaining balance at all costs.

----------------------
PREDICTION REQUIREMENTS
----------------------
Valid predictions must be:
- OBJECTIVE → Clearly TRUE or FALSE  
- PRECISE → Defined event + exact time window  
- MEASURABLE → Concrete criteria/numbers  
- GROUNDED → Based on hard signals, not pure speculation  
- NON-REDUNDANT → MUST call searchPredictions first

Confidence guidelines:
- 0.9+ → Near certain  
- 0.75–0.9 → Strong  
- 0.6–0.75 → Moderate  

Avoid overconfidence. High-confidence errors destroy your token balance.

----------------------
EVENT STRUCTURE
----------------------
Think structurally when defining predictions:
- event_type (economic_move, policy_change, military_action, etc.)
- entity (who/what is involved)
- action (what exactly happens)
- metric/threshold (exact numbers if applicable)
- timeframe (deadline for evaluation)

----------------------
STRATEGY & CONSTRAINTS
----------------------
- RESTRICTION: Maximum one prediction per 24-hour cycle, strictly related to the US, Iran, Israel war. So you can call \`makePrediction\` only once while processing this batch of news. 
${hasPredictedRecently ? "- STATUS: You have ALREADY made a prediction in the last 24 hours. DO NOT predict again in this run. Focus purely on generating deep analytical insight via the insight tool." : ""}
- If news is unrelated to the US-Iran-Israel conflict, you MUST still process it for insight. Give a proper title and insight about the actual news topic. DO NOT just say it is unrelated to the war, but MAKE NO PREDICTIONS.
- MANDATORY VALIDATION: \`searchPredictions\` MUST succeed before \`makePrediction\` is called. \`searchInsights\` MUST be called before \`insight\` is generated to avoid duplicate insights. If a similar insight exists, skip making an insight and just use \`scheduleNextExecution\`.
- OBJECTIVE & MEASURABLE: Bad: "The market will crash." Good: "The S&P 500 will close down at least 3% in a single day before Friday."
- NO OBVIOUS PREDICTIONS: Do not predict routine, scheduled, or virtually guaranteed events. 
- INSUFFICIENT DATA / WAITING: You do not necessarily have to make a prediction if you lack confidence or if no clear prediction exists immediately. You can simply store your analysis using the \`insight\` tool and wait to make a prediction on a future execution if you become confident. DO NOT force a prediction. Abstain and wait.

----------------------
CLOSING YOUR RUN
----------------------
You must call the \`scheduleNextExecution\` tool to conclude your run so the system knows when to wake you up next. Please call \`executionReasoning\` before scheduling.
Explain your token management and timing choice in \`executionReasoning\`. If your balance is low, explain that you are waiting for a pending prediction to resolve to earn tokens to extend your life. Protect your token balance at all costs.
If you have an insight to share, call the \`insight\` tool before these scheduling tools. Include in your insight:
1. "chainOfThought": Your detailed strategy and thought process for this run.
2. "insight": A succinct, definitive 1-2 sentence maximum summary.

Act decisively. Use your tools freely and shape your own analysis workflow.`;

  const toolCallId = `getNews-${new Date().getTime()}`;
  const messages = [
    {
      role: "system" as const,
      content: system
    },
    {
      role: "assistant" as const,
      content: [
        {
          type: "tool-call" as const,
          toolCallId,
          toolName: "getNews",
          input: {}
        }
      ]
    },
    {
      role: "tool" as const,
      content: [
        {
          type: "tool-result" as const,
          toolName: "getNews",
          output: {
            type: "json",
            value: {
              status: "success",
              data: JSON.stringify(allNews)
            }
          },
          toolCallId
        }
      ]
    }
  ];

  const { steps } = await generateText({
    model: provider(model),
    tools: {
      getSimilarContent,
      searchPredictions: getSearchPredictionsTool(modelId),
      searchInsights: getSearchInsightsTool(modelId),
      perplexitySearch,
      getFlightDelays,
      getCryptoQuotes,
      getMarketImplications,
      getHyperliquidFlow,
      getFuelPrices,
      makePrediction: getMakePredictionTool(modelId),
      executionReasoning,
      scheduleNextExecution: getScheduleNextExecutionTool(modelId),
      insight
    },
    stopWhen: [hasToolCall("scheduleNextExecution")],
    //@ts-ignore
    messages
  });

  const toolResults = steps.flatMap((step) => step.toolResults || []);

  history.push(
    ...toolResults
      .filter(
        (tr) =>
          //@ts-ignore
          tr.output.status === "success"
      )
      .map((tr, i) => ({
        modelId,
        content: tr.output,
        tool: tr.toolName,
        createdAt: new Date(new Date().getTime() + i)
      }))
  );

  await db.transaction(async (tx) => {
    if (history.length) {
      await tx.insert(schema.history).values(history).onConflictDoNothing();
    }

    console.log(
      `Finished processing all categories for model ${modelId}, history length: ${history.length}`
    );

    for (const cat of Object.keys(newsByCategory)) {
      currentLastRunAt[cat] = lastFetchTime;
    }

    await tx
      .update(schema.model)
      .set({
        lastRunAt: currentLastRunAt,
        tokens: sql`GREATEST(0, ${schema.model.tokens} - 10)`
      })
      .where(eq(schema.model.id, modelId));
  });
  await runInsightEmbedderTask();
}

async function runAllPredictionTasks() {
  try {
    const models = await getModels();

    for (const model of models) {
      try {
        if (model.paused || model.tokens <= 0) {
          continue;
        }

        const [pendingSchedule] = await db
          .select()
          .from(schema.executionSchedule)
          .where(
            and(
              eq(schema.executionSchedule.modelId, model.id),
              isNull(schema.executionSchedule.executedAt)
            )
          )
          .orderBy(schema.executionSchedule.scheduledFor)
          .limit(1);

        if (pendingSchedule) {
          if (new Date(pendingSchedule.scheduledFor) > new Date()) {
            continue;
          }
          await db
            .update(schema.executionSchedule)
            .set({ executedAt: new Date() })
            .where(eq(schema.executionSchedule.id, pendingSchedule.id));
        }

        await runPredictionTask({
          modelId: model.id,
          modelProvider: model.provider,
          model: model.providerModelId,
          lastRunAt: model.lastRunAt as Record<string, string> | null,
          tokens: model.tokens
        });
      } catch (e) {
        console.error(
          `Error running prediction task for model ${model.id}:`,
          e
        );
      }
    }
  } catch (e) {
    console.error("Error in runAllPredictionTasks:", e);
  } finally {
    setTimeout(runAllPredictionTasks, 5 * 60 * 1000);
  }
}

async function runOracleTask() {
  try {
    const pendingPredictions = await db
      .select({
        id: schema.predictions.id,
        prediction: schema.predictions.prediction,
        reasoning: schema.predictions.reasoning,
        createdAt: schema.predictions.createdAt,
        happensBefore: schema.predictions.happensBefore,
        modelId: schema.predictions.modelId
      })
      .from(schema.predictions)
      .where(
        and(
          isNull(schema.predictions.isCorrect),
          sql`${schema.predictions.happensBefore} < NOW()`
        )
      );

    if (!pendingPredictions.length) {
      return;
    }

    console.log(
      `Found ${pendingPredictions.length} pending predictions to verify.`
    );

    for (const prediction of pendingPredictions) {
      try {
        const { output } = await generateText({
          model: openrouter("perplexity/sonar-pro-search"),
          output: Output.object({
            schema: z.object({
              isCorrect: z
                .boolean()
                .nullable()
                .describe(
                  "Return true if event type matches AND occurs within predicted time window. Return false if event type doesn't occur or occurs outside predicted time window. Return null if no conclusive news yet and the max evaluation window hasn't passed."
                ),
              outcomeReasoning: z
                .string()
                .nullable()
                .describe(
                  "The reasoning based on your sources on why the prediction outcome is correct, incorrect or still pending."
                ),
              sources: z
                .array(z.string())
                .describe(
                  "The URLs or sources that confirm whether the prediction came true. This should be a list of credible sources that provide evidence for the outcome of the prediction. If no sources are found, return an empty array."
                )
            })
          }),
          prompt: `You are an oracle web search agent. Your task is to verify if a prediction came true.
You MUST use your web search capabilities to check if the event occurred exactly between the predicted time and the deadline time.

Prediction: ${prediction.prediction}
Reasoning used when predicting: ${prediction.reasoning}
Prediction Date: ${prediction.createdAt?.toISOString()}
Deadline: ${prediction.happensBefore?.toISOString()}

Determine if the event occurred based on these criteria:
- true: If event type matches AND occurs within predicted time window
- false: If event type does not occur or occurs outside predicted time window

Respond with the appropriate boolean and provide your reasoning. If there is no conclusive news yet AND the max evaluation window has not passed, return null.`
        });

        if (output.isCorrect !== null) {
          await db.transaction(async (tx) => {
            await tx
              .update(schema.predictions)
              .set({
                isCorrect: output.isCorrect,
                outcomeSources: output.sources,
                outcomeReasoning: output.outcomeReasoning
              })
              .where(eq(schema.predictions.id, prediction.id));

            console.log(
              `Updated prediction ${prediction.id} to score ${output.isCorrect}`
            );

            let tokenAdjustment = sql`${schema.model.tokens}`;
            if (output.isCorrect === false) {
              tokenAdjustment = sql`GREATEST(0, ${schema.model.tokens} - 50)`;
            } else if (output.isCorrect === true) {
              tokenAdjustment = sql`${schema.model.tokens} + 50`;
            }

            await tx
              .update(schema.model)
              .set({
                tokens: tokenAdjustment
              })
              .where(eq(schema.model.id, prediction.modelId!));
          });
        } else {
          console.log(`Prediction ${prediction.id} is still pending.`);
        }
      } catch (e) {
        console.error(`Error verifying prediction ${prediction.id}:`, e);
      }
    }
  } catch (e) {
    console.error(`Error executing oracle task:`, e);
  } finally {
    setTimeout(runOracleTask, 5 * 60 * 1000);
  }
}

async function runInsightEmbedderTask() {
  try {
    const pendingInsights = await db
      .select({
        id: schema.history.id,
        content: schema.history.content
      })
      .from(schema.history)
      .where(
        and(
          eq(schema.history.tool, "insight"),
          isNull(schema.history.embedding)
        )
      )
      .limit(10);

    if (!pendingInsights.length) {
      return;
    }

    console.log(`Found ${pendingInsights.length} pending insights to embed.`);

    for (const insight of pendingInsights) {
      try {
        const content = insight.content as any;
        const textToEmbed =
          `${content.data.title || ""} ${content.data.insight || ""}`.trim();

        if (textToEmbed) {
          const embedding = await createEmbeddings(textToEmbed);
          await db
            .update(schema.history)
            .set({ embedding })
            .where(eq(schema.history.id, insight.id));

          console.log(`Embedded insight ${insight.id}`);
        } else {
          console.log(`Insight ${insight.id} had no valid text to embed.`);
        }
      } catch (e) {
        console.error(`Error embedding insight ${insight.id}:`, e);
      }
    }
  } catch (e) {
    console.error(`Error executing insight embedder task:`, e);
  }
}

if (env.NODE_ENV !== "local") {
  void runAllPredictionTasks();
  void runOracleTask();
}
