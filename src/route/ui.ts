import { Hono } from "hono";
import { html } from "hono/html";
import { PredictionService } from "../service";

const router = new Hono();

router.get("/", async (c) => {
  const models = await PredictionService.getModels();

  // We can fetch data concurrently per model
  const modelData = await Promise.all(
    models.map(async (m) => {
      const stats = await PredictionService.getModelStats(m.id);

      const { data: insights } = await PredictionService.getModelHistory({
        modelId: m.id,
        limit: 10,
        onlyInsights: true
      });

      const { data: executionReasoning } =
        await PredictionService.getModelHistory({
          modelId: m.id,
          limit: 10,
          onlyExecutionReasoning: true
        });

      const { data: predictions } = await PredictionService.getModelPredictions(
        {
          modelId: m.id,
          limit: 10
        }
      );

      const predictionsTyped = predictions.map((p) => ({
        ...p,
        isPrediction: true
      }));

      const historyItems = [
        ...insights,
        ...executionReasoning,
        ...predictionsTyped
      ].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return {
        model: m,
        stats,
        historyItems,
        predictions
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
                      <div>Score: ${d.stats.score}</div>
                      <div>Accuracy: ${d.stats.accuracy}</div>
                      <div>Total Predictions: ${d.stats.totalPredictions}</div>
                      <div>
                        Pending: ${d.stats.pendingUnverifiedPredictions}
                      </div>
                      <div>Correct: ${d.stats.correct}</div>
                      <div>Tokens: ${d.model.tokens}</div>
                    </div>

                    <div class="section">
                      <h3>[ HISTORY ]</h3>
                      ${d.historyItems.length === 0 ? html`<p>No data</p>` : ""}
                      ${d.historyItems.map((item, index) => {
                        const isPrediction = "isPrediction" in item;
                        if (isPrediction) {
                          const p = item as any;
                          return html`
                            <div class="item">
                              <div class="meta">
                                ${new Date(p.createdAt).toLocaleString()} |
                                [PREDICTION] | Confidence: ${p.confidence}%
                              </div>
                              <strong>${p.prediction}</strong>
                              <p>Reasoning: ${p.reasoning}</p>
                              ${p.isCorrect !== null
                                ? html`<div>
                                    Outcome:
                                    ${p.isCorrect > 0 ? "Correct" : "Incorrect"}
                                    (${p.outcomeReasoning})
                                  </div>`
                                : html`<div>Status: Pending verification</div>`}
                            </div>
                          `;
                        }

                        const content = item.content as any;
                        const uid = `block_${d.model.id}_${item.id}_${index}`;

                        if (item.tool === "insight") {
                          return html`
                            <div class="item">
                              <div class="meta">
                                ${new Date(item.createdAt).toLocaleString()} |
                                [INSIGHT]
                              </div>
                              <strong
                                >${content?.data?.title || "Insight"}</strong
                              >
                              <p>${content?.data?.insight}</p>
                              ${content?.data?.chainOfThought
                                ? html`
                                    <button
                                      class="toggle-btn"
                                      onclick="document.getElementById('cot_${uid}').style.display = document.getElementById('cot_${uid}').style.display === 'none' ? 'block' : 'none'"
                                    >
                                      Toggle Chain of Thought
                                    </button>
                                    <pre id="cot_${uid}" style="display: none;">
${content.data.chainOfThought}</pre
                                    >
                                  `
                                : ""}
                            </div>
                          `;
                        } else {
                          return html`
                            <div class="item">
                              <div class="meta">
                                ${new Date(item.createdAt).toLocaleString()} |
                                [EXECUTION REASONING]
                              </div>
                              <button
                                class="toggle-btn"
                                onclick="document.getElementById('er_${uid}').style.display = document.getElementById('er_${uid}').style.display === 'none' ? 'block' : 'none'"
                              >
                                Toggle Execution Reasoning
                              </button>
                              <div id="er_${uid}" style="display: none;">
                                <pre>${content?.data?.reasoning}</pre>
                                <div class="meta">
                                  Next execution locale:
                                  ${content?.data?.scheduledFor}
                                </div>
                              </div>
                            </div>
                          `;
                        }
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
