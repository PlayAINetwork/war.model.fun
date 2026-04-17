import { Hono } from "hono";
import { html } from "hono/html";
import { PredictionService } from "../service";
import db, { schema } from "../drizzle";
import { desc, inArray } from "drizzle-orm";

const router = new Hono();

router.get("/", async (c) => {
  const models = await PredictionService.getModels();

  if (models.length === 0) {
    return c.html(
      html`<!DOCTYPE html>
        <html lang="en">
          <body>
            <p>No models</p>
          </body>
        </html>`
    );
  }

  const modelIds = models.map((m) => m.id);

  const [allHistory, allPredictions] = await Promise.all([
    db
      .select({
        id: schema.history.id,
        modelId: schema.history.modelId,
        content: schema.history.content,
        tool: schema.history.tool,
        createdAt: schema.history.createdAt
      })
      .from(schema.history)
      .where(inArray(schema.history.modelId, modelIds))
      .orderBy(desc(schema.history.createdAt))
      .limit(1000),

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
        createdAt: schema.predictions.createdAt
      })
      .from(schema.predictions)
      .where(inArray(schema.predictions.modelId, modelIds))
      .orderBy(desc(schema.predictions.createdAt))
      .limit(200)
  ]);

  // We can fetch data concurrently per model
  const modelData = await Promise.all(
    models.map(async (m) => {
      const stats = await PredictionService.getModelStats(m.id);

      const insights = allHistory.filter(
        (h) => h.modelId === m.id && h.tool === "insight"
      );
      const executionReasoning = allHistory.filter(
        (h) => h.modelId === m.id && h.tool === "executionReasoning"
      );
      const schedules = allHistory.filter(
        (h) => h.modelId === m.id && h.tool === "scheduleNextExecution"
      );
      const predictions = allPredictions.filter((p) => p.modelId === m.id);

      const predictionsTyped = predictions.map((p) => ({
        ...p,
        isPrediction: true
      }));
      const schedulesTyped = schedules.map((s) => ({
        ...s,
        isSchedule: true
      }));

      const historyItems = [
        ...insights,
        ...executionReasoning,
        ...schedulesTyped,
        ...predictionsTyped
      ].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const cycles: any[][] = [];
      let currentCycle: any[] = [];
      for (const item of historyItems) {
        if (currentCycle.length === 0) {
          currentCycle.push(item);
        } else {
          const lastItem = currentCycle[currentCycle.length - 1];
          if (
            Math.abs(
              new Date(lastItem.createdAt).getTime() -
                new Date(item.createdAt).getTime()
            ) < 120000
          ) {
            currentCycle.push(item);
          } else {
            cycles.push(currentCycle);
            currentCycle = [item];
          }
        }
      }
      if (currentCycle.length > 0) {
        cycles.push(currentCycle);
      }

      const groupedHistory = cycles.map((cycle) => {
        return {
          executionReasoning: cycle.find(
            (i) =>
              !("isPrediction" in i) &&
              !("isSchedule" in i) &&
              i.tool === "executionReasoning"
          ),
          insight: cycle.find(
            (i) =>
              !("isPrediction" in i) &&
              !("isSchedule" in i) &&
              i.tool === "insight"
          ),
          prediction: cycle.find((i) => "isPrediction" in i),
          schedule: cycle.find((i) => "isSchedule" in i),
          timestamp: cycle[0].createdAt
        };
      });

      return {
        model: m,
        stats,
        groupedHistory
      };
    })
  );

  return c.html(
    html`<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>War Model Fun - AI Stats</title>
          <style>
            body {
              background-color: #000;
              color: #0f0;
              font-family: "Courier New", Courier, monospace;
              padding: 20px;
              line-height: 1.4;
            }
            h1,
            h2,
            h3 {
              text-shadow: 0 0 5px #0f0;
            }
            .model-card {
              border: 1px solid #0f0;
              padding: 15px;
              margin-bottom: 20px;
              box-shadow: 0 0 10px #050;
            }
            .stats {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
              gap: 10px;
              margin-bottom: 20px;
              border-bottom: 1px dashed #0f0;
              padding-bottom: 10px;
            }
            .section {
              margin-top: 15px;
            }
            .item {
              border-left: 2px solid #050;
              padding-left: 10px;
              margin-bottom: 15px;
            }
            .item-title {
              font-weight: bold;
            }
            .meta {
              font-size: 0.8em;
              opacity: 0.8;
            }
            .toggle-btn {
              background: #020;
              color: #0f0;
              border: 1px solid #050;
              cursor: pointer;
              margin-top: 5px;
              padding: 2px 5px;
              font-family: inherit;
              font-size: 0.8em;
            }
            .toggle-btn:hover {
              background: #050;
            }
            pre {
              white-space: pre-wrap;
              background: #020;
              padding: 10px;
              border: 1px solid #050;
            }
          </style>
        </head>
        <body>
          <h1>> WAR.MODEL.FUN _</h1>
          <p>System Status: ONLINE</p>
          <marquee scrollamount="5">
            Monitoring live prediction feeds and model execution reasoning...
          </marquee>

          <div id="models">
            ${modelData
              .filter((d) => d.stats.totalPredictions > 0)
              .map(
                (d) => html`
                  <div class="model-card">
                    <h2>
                      >> ${d.model.providerModelId}
                      <!-- (${d.model.name}) -->
                    </h2>

                    <div class="stats">
                      <div>Accuracy: ${d.stats.accuracy}</div>
                      <div>Total Predictions: ${d.stats.totalPredictions}</div>
                      <div>Pending: ${d.stats.pending}</div>
                      <div>Correct: ${d.stats.correct}</div>
                      <div>Tokens: ${d.model.tokens}</div>
                    </div>

                    <div class="section">
                      <h3>[ HISTORY ]</h3>
                      ${d.groupedHistory.length === 0
                        ? html`<p>No data</p>`
                        : ""}
                      ${d.groupedHistory.map((group, index) => {
                        const uid = `block_${d.model.id}_${index}`;
                        const er = group.executionReasoning;
                        const insight = group.insight;
                        const pred = group.prediction;
                        const sched = group.schedule;

                        return html`
                          <div>
                            ${er
                              ? html`
                                  <div class="item">
                                    <div class="meta">
                                      ${new Date(er.createdAt).toLocaleString()}
                                    </div>
                                    <strong>[EXECUTION REASONING]</strong><br />
                                    <button
                                      class="toggle-btn"
                                      onclick="document.getElementById('er_${uid}').style.display = document.getElementById('er_${uid}').style.display === 'none' ? 'block' : 'none'"
                                    >
                                      Toggle Execution Reasoning
                                    </button>
                                    <div id="er_${uid}" style="display: none;">
                                      <pre>${er.content?.data?.reasoning}</pre>
                                    </div>
                                    ${sched
                                      ? html`
                                          <div
                                            class="meta"
                                            style="margin-top: 10px;"
                                          >
                                            <strong>[NEXT SCHEDULE]</strong
                                            ><br />
                                            Next execution schedule:
                                            ${new Date(
                                              sched.content?.data?.scheduledFor
                                            ).toLocaleString()}
                                          </div>
                                        `
                                      : html`
                                          <div
                                            class="meta"
                                            style="margin-top: 10px;"
                                          >
                                            <strong>[NEXT SCHEDULE]</strong
                                            ><br />
                                            Next execution rationale:
                                            ${er.content?.data
                                              ?.nextExecutionTimeRationale}
                                          </div>
                                        `}
                                  </div>
                                `
                              : ""}
                            ${insight
                              ? html`
                                  <div class="item">
                                    <strong>[INSIGHT]</strong><br />
                                    <strong
                                      >${insight.content?.data?.title ||
                                      "Insight"}</strong
                                    >
                                    <p>${insight.content?.data?.insight}</p>
                                    ${insight.content?.data?.chainOfThought
                                      ? html`
                                          <button
                                            class="toggle-btn"
                                            onclick="document.getElementById('cot_${uid}').style.display = document.getElementById('cot_${uid}').style.display === 'none' ? 'block' : 'none'"
                                          >
                                            Toggle Chain of Thought
                                          </button>
                                          <pre
                                            id="cot_${uid}"
                                            style="display: none;"
                                          >
${insight.content.data.chainOfThought}</pre
                                          >
                                        `
                                      : ""}
                                  </div>
                                `
                              : ""}
                            ${pred
                              ? html`
                                  <div class="item">
                                    <strong>[PREDICTION]</strong><br />
                                    <div class="meta">
                                      Confidence: ${pred.confidence}%
                                    </div>
                                    <strong>${pred.prediction}</strong>
                                    <p>Reasoning: ${pred.reasoning}</p>
                                    ${pred.isCorrect !== null
                                      ? html`<div>
                                          Outcome:
                                          ${pred.isCorrect > 0
                                            ? "Correct"
                                            : "Incorrect"}
                                          (${pred.outcomeReasoning})
                                        </div>`
                                      : html`<div>
                                          Status: Pending verification
                                        </div>`}
                                  </div>
                                `
                              : ""}
                            <hr
                              style="border: 0; border-top: 1px dashed #0f0; margin: 20px 0;"
                            />
                          </div>
                        `;
                      })}
                    </div>
                  </div>
                `
              )}
          </div>
        </body>
      </html>`
  );
});

export default router;
