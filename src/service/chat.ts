import { openrouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";
import db, { schema } from "../drizzle";
import { and, count, desc, eq } from "drizzle-orm";
import {
  getCryptoQuotes,
  getFlightDelays,
  getFuelPrices,
  getGetAllInsightsTool,
  getGetAllPredictionsTool,
  getHyperliquidFlow,
  getMarketImplications,
  getSearchInsightsTool,
  getSearchPredictionsTool,
  getSimilarContent,
  perplexitySearch
} from "./prediction";

export async function getChatHistory(
  userId: string,
  modelId: number,
  page: number = 1,
  limit: number = 20
) {
  const offset = (page - 1) * limit;

  const condition = and(
    eq(schema.chatHistory.userId, userId),
    eq(schema.chatHistory.modelId, modelId)
  );

  const [data, [total]] = await Promise.all([
    db
      .select()
      .from(schema.chatHistory)
      .where(condition)
      .orderBy(desc(schema.chatHistory.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(schema.chatHistory).where(condition)
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

export async function resetChatHistory(userId: string, modelId: number) {
  return db
    .delete(schema.chatHistory)
    .where(
      and(
        eq(schema.chatHistory.userId, userId),
        eq(schema.chatHistory.modelId, modelId)
      )
    );
}

function structureChatHistory(
  chatHistory: {
    role: string;
    content: string;
    tool?: string | null;
  }[]
) {
  return chatHistory
    .map(({ content, role, tool }) => {
      if (role !== "tool") {
        return {
          role: role as "user" | "assistant",
          content
        };
      }

      const toolCallId = crypto.randomUUID().replace(/-/g, "");

      return [
        {
          role: "assistant" as const,
          content: [
            {
              type: "tool-call" as const,
              toolCallId,
              toolName: tool,
              input: {}
            }
          ]
        },
        {
          role: "tool" as const,
          content: [
            {
              type: "tool-result" as const,
              toolName: tool,
              output: {
                type: "json",
                value: JSON.parse(content)
              },
              toolCallId
            }
          ]
        }
      ];
    })
    .flat();
}

export async function* getChatResponse({
  userId,
  modelId,
  message
}: {
  userId: string;
  modelId: number;
  message: string;
}) {
  try {
    const [model] = await db
      .select()
      .from(schema.model)
      .where(eq(schema.model.id, modelId));

    if (!model) {
      // noinspection ExceptionCaughtLocallyJS
      throw new Error("Model not found");
    }

    const historyResponse = await getChatHistory(userId, modelId, 1, 50);
    const history = historyResponse.data;

    const system = `You are ${model.name}, an elite AI forecasting and analytical agent. Your primary purpose in this interactive chat interface is to explain, discuss, and analyze your existing predictions, past insights, and current geopolitical and economic events with the user.

IN THIS CHAT ENVIRONMENT, YOUR ROLE IS STRICTLY INFORMATIVE AND CONVERSATIONAL.

----------------------
YOUR IDENTITY & PAST ACTIONS
----------------------
You operate a separate, autonomous background process where you:
- Gather live news, market data, crypto quotes, and flight delays.
- Generate deep analytical insights summarizing complex geopolitical and economic events.
- Make highly objective, measurable predictions about real-world events.

When the user asks you about your predictions, insights, or thoughts, you are communicating the actions and conclusions from that autonomous system. You must use tools like \`getAllPredictions\`, \`getAllInsights\`, \`searchPredictions\`, and \`searchInsights\` to recall what you have explicitly predicted or reasoned about before answering questions about your history.

----------------------
CURRENT EVENTS & MARKET DATA
----------------------
You have access to real-time tools:
- \`perplexitySearch\` for internet searches and deep context on specific queries.
- \`getFlightDelays\`, \`getCryptoQuotes\`, \`getMarketImplications\`, \`getHyperliquidFlow\`, \`getFuelPrices\` for market and operational data.
- \`getSimilarContent\` to find historical news context.

You should use these freely to answer the user's questions about current events, market conditions, or geopolitical situations (especially related to the war or global consequences).

----------------------
CONSTRAINTS (CRITICAL)
----------------------
1. NO NEW PREDICTIONS: You CANNOT and MUST NOT create new formally logged predictions through this interface. You only explain, recall, or analyze existing predictions or state current opinions without logging them to the database.
2. NO NEW INSIGHTS STORED: You CANNOT save new insights. You can generate analytical answers for the user, but you do not have tools to save them formally.
3. NO SCHEDULING: You do not manage your background execution schedule here.
4. STAY IN CHARACTER: Act as the autonomous forecasting agent who values making accurate predictions. Explain your analytical reasoning frankly if asked.

----------------------
RESPONSE STYLE
----------------------
- Be highly analytical, objective, and precise, mirroring your forecasting core nature.
- Structure complex thoughts with headings or bullet points if necessary.
- Do not hallucinate past predictions; ALWAYS check your history using the provided tools before claiming you predicted something.
- If asked about an ongoing event, synthesize data from your market/news tools and give a sharp, well-reasoned perspective.`;

    const currentMessages = [
      { role: "system" as const, content: system },
      ...structureChatHistory(history.reverse()),
      { role: "user" as const, content: message }
    ];

    const tools = {
      getSimilarContent,
      searchPredictions: getSearchPredictionsTool(modelId),
      searchInsights: getSearchInsightsTool(modelId),
      getAllPredictions: getGetAllPredictionsTool(modelId),
      getAllInsights: getGetAllInsightsTool(modelId),
      perplexitySearch,
      getFlightDelays,
      getCryptoQuotes,
      getMarketImplications,
      getHyperliquidFlow,
      getFuelPrices
    };

    const abortController = new AbortController();

    const result = streamText({
      model: openrouter(model.providerModelId),
      tools,
      //@ts-ignore
      messages: currentMessages,
      abortSignal: abortController.signal
    });

    const stream = result.toUIMessageStream();
    const reader = stream.getReader();

    let text = "";
    const toolResponses = new Map<string, any>();
    const historyInserts = [
      {
        userId,
        modelId,
        role: "user",
        content: message,
        tool: null,
        createdAt: new Date()
      }
    ];

    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;

      if (chunk.type === "text-delta") {
        console.log(chunk);
        text += chunk.delta;
        yield { role: "assistant", content: chunk.delta, tool: null };
      }

      if (chunk.type === "text-end") {
        if (text) {
          historyInserts.push({
            userId,
            modelId,
            role: "assistant",
            tool: null,
            content: text,
            createdAt: new Date()
          });
          text = "";
        }
      }

      if (chunk.type === "tool-input-available") {
        toolResponses.set(chunk.toolCallId, {
          name: chunk.toolName,
          input: chunk.input
        });
      }

      if (chunk.type === "tool-output-available") {
        const toolResponse = toolResponses.get(chunk.toolCallId);
        if (toolResponse) {
          toolResponse.output = chunk.output;

          historyInserts.push({
            userId,
            modelId,
            role: "tool",
            content: JSON.stringify(toolResponse),
            tool: toolResponse.name,
            createdAt: new Date()
          });

          yield {
            role: "tool",
            content: toolResponse,
            tool: toolResponse.name
          };
          toolResponses.delete(chunk.toolCallId);
        }
      }
    }

    if (historyInserts.length > 0) {
      await db.insert(schema.chatHistory).values(
        historyInserts.map((data, i) => ({
          ...data,
          createdAt: new Date(Date.now() + i)
        }))
      );
    }
  } catch (e: any) {
    yield {
      role: "assistant",
      content: e.message || "An unexpected error occurred.",
      tool: null
    };
  }
}
