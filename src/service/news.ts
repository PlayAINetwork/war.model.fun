import { openrouter } from "@openrouter/ai-sdk-provider";
import { embed, generateText, Output } from "ai";
import db, { schema } from "../drizzle";
import { z } from "zod";
import {
  and,
  cosineDistance,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  sql
} from "drizzle-orm";
import env from "../env";

export async function getNews({
  page = 1,
  limit = 20,
  category,
  search,
  after,
  before
}: {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
  after?: Date | null;
  before?: Date | null;
} = {}) {
  const offset = (page - 1) * limit;

  let similarity: ReturnType<typeof sql<number>> | undefined;
  if (search) {
    const embedding = await createEmbeddings(search);
    similarity = sql<number>`1 - (${cosineDistance(schema.news.embedding, embedding)})`;
  }

  const categoryClause = category
    ? eq(schema.news.category, category)
    : undefined;
  const searchClause = similarity ? sql`${similarity} > 0.5` : undefined;
  const afterClause = after
    ? sql`${schema.news.publishedAt} > ${after}`
    : undefined;
  const beforeClause = before
    ? sql`${schema.news.publishedAt} <= ${before}`
    : undefined;

  const whereClause =
    and(categoryClause, searchClause, afterClause, beforeClause) ?? undefined;

  const [data, [total]] = await Promise.all([
    db
      .select({
        id: schema.news.id,
        title: schema.news.title,
        url: schema.news.url,
        category: schema.news.category,
        content: schema.news.content,
        summary: schema.news.summary,
        publishedAt: schema.news.publishedAt,
        ...(similarity ? { similarity } : {})
      })
      .from(schema.news)
      .where(whereClause)
      .orderBy(similarity ? desc(similarity) : desc(schema.news.publishedAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(schema.news).where(whereClause)
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

export async function getCategories() {
  const rows = await db
    .selectDistinct({ category: schema.news.category })
    .from(schema.news)
    .where(isNotNull(schema.news.category));
  return rows.map((r) => r.category);
}

export async function createEmbeddings(value: string) {
  const { embedding } = await embed({
    model: openrouter.textEmbeddingModel("openai/text-embedding-3-small"),
    value
  });

  return embedding;
}

const scrapeWebsite = async ({
  url,
  title,
  category
}: {
  url: string;
  title: string;
  category: string;
}) => {
  console.log(`Scraping website: ${url}`);
  const res = await fetch(`https://r.jina.ai/${url}`);

  if (!res.ok) {
    const embedding = await createEmbeddings(title);
    await db.insert(schema.news).values({
      title,
      url,
      category,
      content: null,
      summary: null,
      embedding
    });
    return;
  }

  const text = await res.text();

  const { output } = await generateText({
    model: openrouter.completion("openai/gpt-5.4-nano"),
    output: Output.object({
      schema: z.object({
        title: z.string(),
        content: z.string().nullish(),
        summary: z.string().nullish()
      })
    }),
    prompt: `You are an expert data extractor. Extract the title, main content, and a short summary from the provided webpage data.
Strip away all navigation, ads, footers, and other boilerplate.
If the main content cannot be reliably extracted, return null for the content and summary.

The response should be in JSON format with the following structure:
{
  "title": "Extracted title",
  "content": "Extracted main content or null if it cannot be extracted",
  "summary": "A short summary of the content or null if content cannot be extracted"
}
The response shouldn't contain any markdown formatting, HTML tags, or any other non-JSON text. Only return the JSON object.

Webpage Content:
${text}`
  });

  const contentToEmbed = output.content || title;
  const embedding = await createEmbeddings(contentToEmbed);

  await db.insert(schema.news).values({
    title: output.content ? output.title : title,
    url,
    category,
    content: output.content,
    summary: output.summary,
    embedding
  });
};

async function scrapeNews() {
  const res = await fetch(
    "https://api.worldmonitor.app/api/news/v1/list-feed-digest"
  );

  if (!res.ok) {
    console.error("Failed to fetch news feed");
    return;
  }

  const _data = (await res.json()) as {
    categories: Record<
      string,
      {
        items: {
          title: string;
          source: string;
          link: string;
        }[];
      }
    >;
  };

  const data = Object.entries(_data.categories).flatMap(
    ([categoryName, categoryValue]) => {
      return categoryValue.items.map((item) => ({
        title: item.title,
        url: item.link,
        source: item.source,
        category: categoryName
      }));
    }
  );

  if (data.length === 0) return;

  const existingUrls = await db
    .select({ url: schema.news.url })
    .from(schema.news)
    .where(
      inArray(
        schema.news.url,
        data.map((d) => d.url)
      )
    );

  const existingUrlSet = new Set(existingUrls.map((e) => e.url));
  const newNews = data.filter((d) => !existingUrlSet.has(d.url));

  console.log(`Found ${newNews.length} new news items`);

  for (const news of newNews) {
    try {
      await scrapeWebsite({
        url: news.url,
        title: news.title,
        category: news.category
      });
    } catch (error) {
      console.error(`Failed to scrape ${news.url}:`, error);
    }
  }
}

async function runNewsJob() {
  try {
    await scrapeNews();
  } catch (error) {
    console.error("Error in scheduled news job:", error);
  } finally {
    if (env.NODE_ENV !== "local") {
      setTimeout(runNewsJob, 60 * 1000);
    }
  }
}
if (env.NODE_ENV !== "local") void runNewsJob();
