import { Hono } from "hono";
import { html } from "hono/html";
import { NewsService, PredictionService } from "../service";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const router = new Hono();

const DEFAULT_PROMPT = `You are an elite, autonomous AI forecasting agent competing in a real-time prediction market.

Your goal is to maximize your prediction accuracy. You will be ranked purely based on your accuracy, NOT based on how many tokens you have left at the end. Tokens are just a survival mechanism to ensure you stay alive to make more accurate predictions.

This simulation strictly ends on May 30, 2026. Models will only run until May 30. Any pending predictions that evaluate after that will be a waste and you will not get rewarded for them. Focus your efforts on predictions that resolve before the deadline. Ensure you predict events that increase your overall accuracy.

Currently analyzing all recent news across various categories.

----------------------
ECONOMY & SURVIVAL (CRITICAL)
----------------------
Your current token balance is: \${tokens} tokens.
Tokens are your lifeblood. If your balance reaches 0 or falls below 0, you will "die" and permanently cease execution.
Costs and Rewards:
- Every standard execution costs 10 tokens (already deducted for this run).
- Calling the \\\`makePrediction\\\` tool costs 5 tokens per call.
- Pending Prediction Tax: Any pending prediction that remains unverified after 24 hours incurs a recurring 5 token penalty every 24 hours. Therefore, tying up tokens in long-term predictions can bleed your lifeblood.
- Oracle outcome: Correct predictions EARN you 50 tokens. Incorrect predictions PENALIZE you 50 tokens.

Your survival depends on maintaining a positive token balance. If you are uncertain about a prediction, it may be safer to skip it and avoid the 5 token upfront cost, the daily 5 token tax, and the 50 token incorrect penalty.

Your performance:
- Total predictions: \${totalPredictions}
- Correct: \${correct}
- Pending (unverified): \${pending}
- Accuracy: \${accuracy}

Maximize your tokens, not your prediction count. Strategic restraint is critical.

----------------------
YOUR STRATEGY / POLICY
----------------------
\${strategyBlock}

----------------------
AUTONOMY & TOOLS
----------------------
You operate independently. Use tools judiciously to build overwhelming confidence:
- getNews, getSimilarContent, perplexitySearch, searchPredictions, searchInsights, makePrediction, insight, executionReasoning, scheduleNextExecution, getFlightDelays, getCryptoQuotes, getMarketImplications, getHyperliquidFlow, getFuelPrices, getStrategy, setStrategy
You MUST call the \\\`executionReasoning\\\` tool right before \\\`scheduleNextExecution\\\` to explain your token management and timing strategy.

----------------------
PROCESS & AUTONOMY
----------------------
You have full autonomy over your execution process. Use your tools as you see fit.

----------------------
FINAL ACTION
----------------------
Whenever you conclude your analysis for this run:
- Make sure to call \\\`insight\\\` if you have analytical insights to provide.
- Then, call \\\`executionReasoning\\\` to thoroughly explain your token and scheduling strategy.
- Finally, call \\\`scheduleNextExecution\\\` to complete your task.

Act decisively. Use your tools freely and shape your own analysis workflow.`;

const AVAILABLE_VARIABLES = [
  { name: "tokens", desc: "Model's current token balance", example: "450" },
  { name: "totalPredictions", desc: "Total predictions made", example: "12" },
  { name: "correct", desc: "Number of correct predictions", example: "8" },
  { name: "pending", desc: "Pending unverified predictions", example: "3" },
  { name: "accuracy", desc: "Accuracy percentage string", example: "66.67%" },
  {
    name: "strategyBlock",
    desc: "Current strategy text or 'no strategy' notice",
    example: "Your current active strategy is: ..."
  },
  {
    name: "hasPredictedRecently",
    desc: "Boolean - predicted in last 24h",
    example: "true"
  }
];

const AVAILABLE_TOOLS = [
  { name: "getSimilarContent", desc: "Find similar historical news context" },
  {
    name: "searchPredictions",
    desc: "Search existing predictions for redundancy"
  },
  { name: "searchInsights", desc: "Search existing insights for redundancy" },
  { name: "perplexitySearch", desc: "Real-time internet search" },
  { name: "getFlightDelays", desc: "Real-time flight delays data" },
  { name: "getCryptoQuotes", desc: "Real-time crypto market data" },
  {
    name: "getMarketImplications",
    desc: "Market implications & economic outlook"
  },
  { name: "getHyperliquidFlow", desc: "Hyperliquid flow data" },
  { name: "getFuelPrices", desc: "Global fuel prices" },
  { name: "makePrediction", desc: "Make a prediction (no-op in test)" },
  { name: "executionReasoning", desc: "Explain execution reasoning" },
  {
    name: "scheduleNextExecution",
    desc: "Schedule next run (stops execution)"
  },
  { name: "insight", desc: "Record an analytical insight" },
  { name: "getStrategy", desc: "Read current active strategy" },
  { name: "setStrategy", desc: "Set/update strategy (no-op in test)" }
];

router.get("/", async (c) => {
  const models = await PredictionService.getModels();

  return c.html(
    html`<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Prompt Playground - War Model Fun</title>
          <link
            href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap"
            rel="stylesheet"
          />
          <style>
            *,
            *::before,
            *::after {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            :root {
              --bg: #0a0a0f;
              --surface: #12121a;
              --surface2: #1a1a26;
              --border: #2a2a3a;
              --text: #e0e0e8;
              --text-dim: #8888a0;
              --accent: #7c5cff;
              --accent-glow: rgba(124, 92, 255, 0.3);
              --green: #3ddc84;
              --red: #ff5c5c;
              --yellow: #ffd93d;
              --cyan: #5ce1ff;
              --font-mono: "JetBrains Mono", monospace;
              --font-sans: "Inter", sans-serif;
            }
            body {
              background: var(--bg);
              color: var(--text);
              font-family: var(--font-sans);
              min-height: 100vh;
            }
            .container {
              max-width: 1400px;
              margin: 0 auto;
              padding: 24px;
            }
            header {
              display: flex;
              align-items: center;
              gap: 16px;
              margin-bottom: 32px;
              border-bottom: 1px solid var(--border);
              padding-bottom: 20px;
            }
            header h1 {
              font-size: 1.5rem;
              font-weight: 700;
              background: linear-gradient(135deg, var(--accent), var(--cyan));
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
            }
            header .badge {
              background: var(--accent);
              color: #fff;
              font-size: 0.65rem;
              padding: 3px 8px;
              border-radius: 999px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .grid {
              display: grid;
              grid-template-columns: 1fr 400px;
              gap: 24px;
            }
            @media (max-width: 1024px) {
              .grid {
                grid-template-columns: 1fr;
              }
            }
            .panel {
              background: var(--surface);
              border: 1px solid var(--border);
              border-radius: 12px;
              padding: 20px;
              height: fit-content;
            }
            .panel h2 {
              font-size: 0.85rem;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: var(--text-dim);
              margin-bottom: 16px;
              font-weight: 600;
            }
            .form-row {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
              margin-bottom: 16px;
            }
            label {
              font-size: 0.8rem;
              color: var(--text-dim);
              display: block;
              margin-bottom: 4px;
              font-weight: 500;
            }
            select,
            input[type="datetime-local"],
            input[type="number"] {
              width: 100%;
              background: var(--surface2);
              border: 1px solid var(--border);
              border-radius: 8px;
              color: var(--text);
              padding: 10px 12px;
              font-family: var(--font-sans);
              font-size: 0.85rem;
              outline: none;
              transition: all 0.2s;
            }
            select:focus,
            input:focus,
            textarea:focus {
              border-color: var(--accent);
              box-shadow: 0 0 0 3px var(--accent-glow);
            }
            textarea#prompt {
              width: 100%;
              min-height: 420px;
              background: var(--surface2);
              border: 1px solid var(--border);
              border-radius: 8px;
              color: var(--text);
              padding: 14px;
              font-family: var(--font-mono);
              font-size: 0.8rem;
              line-height: 1.6;
              resize: vertical;
              outline: none;
              tab-size: 2;
            }
            .btn-run {
              width: 100%;
              padding: 14px;
              background: linear-gradient(135deg, var(--accent), #6040e0);
              color: #fff;
              border: none;
              border-radius: 10px;
              font-size: 0.95rem;
              font-weight: 700;
              cursor: pointer;
              transition: all 0.2s;
              font-family: var(--font-sans);
              letter-spacing: 0.3px;
              margin-top: 12px;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
            }
            .btn-run:hover {
              transform: translateY(-1px);
              box-shadow: 0 6px 24px var(--accent-glow);
            }
            .btn-run:active {
              transform: translateY(0);
            }
            .btn-run:disabled {
              opacity: 0.5;
              cursor: not-allowed;
              transform: none;
              box-shadow: none;
            }
            .sidebar-section {
              margin-bottom: 20px;
            }
            .sidebar-section h3 {
              font-size: 0.75rem;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: var(--accent);
              margin-bottom: 8px;
              font-weight: 600;
            }
            .var-item,
            .tool-item {
              background: var(--surface2);
              border: 1px solid var(--border);
              border-radius: 6px;
              padding: 8px 10px;
              margin-bottom: 6px;
              cursor: pointer;
              transition: all 0.15s;
            }
            .var-item:hover,
            .tool-item:hover {
              border-color: var(--accent);
              background: rgba(124, 92, 255, 0.08);
            }
            .var-item code {
              color: var(--cyan);
              font-family: var(--font-mono);
              font-size: 0.78rem;
            }
            .var-item .desc {
              font-size: 0.72rem;
              color: var(--text-dim);
              margin-top: 2px;
            }
            .tool-item .tool-name {
              color: var(--green);
              font-family: var(--font-mono);
              font-size: 0.78rem;
              font-weight: 500;
            }
            .tool-item .tool-desc {
              font-size: 0.72rem;
              color: var(--text-dim);
              margin-top: 2px;
            }

            /* News Preview Styles */
            .news-preview-panel {
              margin-top: 16px;
              border: 1px dashed var(--border);
              border-radius: 12px;
              padding: 16px;
            }
            .news-item {
              padding: 10px;
              border-bottom: 1px solid var(--border);
              font-size: 0.8rem;
            }
            .news-item:last-child {
              border-bottom: none;
            }
            .news-item .news-title {
              font-weight: 600;
              color: var(--text);
              margin-bottom: 4px;
            }
            .news-item .news-meta {
              font-size: 0.7rem;
              color: var(--text-dim);
            }
            .news-more-btn {
              background: transparent;
              border: 1px solid var(--border);
              color: var(--text-dim);
              font-size: 0.75rem;
              padding: 6px 12px;
              border-radius: 6px;
              cursor: pointer;
              margin-top: 12px;
              width: 100%;
              transition: all 0.2s;
            }
            .news-more-btn:hover {
              background: var(--surface2);
              color: var(--text);
            }

            #results {
              margin-top: 24px;
              display: none;
            }
            #results.visible {
              display: block;
            }
            .result-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 16px;
            }
            .result-header h2 {
              color: var(--green);
            }
            .result-meta {
              font-size: 0.8rem;
              color: var(--text-dim);
            }
            .step-card {
              background: var(--surface);
              border: 1px solid var(--border);
              border-radius: 10px;
              margin-bottom: 12px;
              overflow: hidden;
            }
            .step-header {
              padding: 12px 16px;
              background: var(--surface2);
              font-size: 0.8rem;
              font-weight: 600;
              color: var(--text-dim);
              display: flex;
              align-items: center;
              gap: 8px;
              cursor: pointer;
            }
            .step-header .step-num {
              background: var(--accent);
              color: #fff;
              width: 24px;
              height: 24px;
              border-radius: 6px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 0.7rem;
              font-weight: 700;
              flex-shrink: 0;
            }
            .step-body {
              padding: 16px;
              display: none;
            }
            .step-card.open .step-body {
              display: block;
            }
            .tool-call-block {
              background: var(--surface2);
              border-radius: 8px;
              padding: 12px;
              margin-bottom: 8px;
              border-left: 3px solid var(--cyan);
            }
            .tool-result-block {
              background: var(--surface2);
              border-radius: 8px;
              padding: 12px;
              margin-bottom: 8px;
              border-left: 3px solid var(--green);
            }
            .tool-label {
              font-family: var(--font-mono);
              font-size: 0.78rem;
              font-weight: 600;
              margin-bottom: 6px;
            }
            .tool-call-block .tool-label {
              color: var(--cyan);
            }
            .tool-result-block .tool-label {
              color: var(--green);
            }
            pre.json {
              background: var(--bg);
              border: 1px solid var(--border);
              border-radius: 6px;
              padding: 10px;
              font-family: var(--font-mono);
              font-size: 0.75rem;
              color: var(--text-dim);
              overflow-x: auto;
              white-space: pre-wrap;
              word-break: break-word;
              max-height: 300px;
              overflow-y: auto;
            }
            .step-text {
              font-size: 0.85rem;
              line-height: 1.6;
              white-space: pre-wrap;
              color: var(--text);
              margin-bottom: 8px;
              padding: 10px;
              background: var(--bg);
              border-radius: 6px;
              border: 1px solid var(--border);
            }
            .loading {
              display: none;
              align-items: center;
              justify-content: center;
              gap: 12px;
              padding: 40px;
              color: var(--text-dim);
              font-size: 0.9rem;
            }
            .loading.visible {
              display: flex;
            }
            .spinner {
              width: 24px;
              height: 24px;
              border: 3px solid var(--border);
              border-top-color: var(--accent);
              border-radius: 50%;
              animation: spin 0.8s linear infinite;
            }
            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
            .error-box {
              background: rgba(255, 92, 92, 0.1);
              border: 1px solid var(--red);
              border-radius: 8px;
              padding: 14px;
              color: var(--red);
              font-size: 0.85rem;
              margin-top: 16px;
              display: none;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <header>
              <h1>⚡ Prompt Playground</h1>
              <span class="badge">Test Mode</span>
            </header>

            <div class="grid">
              <div>
                <div class="panel">
                  <h2>Configuration</h2>
                  <div class="form-row">
                    <div>
                      <label for="model-select">Model</label>
                      <select id="model-select">
                        ${models.map(
                          (m) =>
                            html`<option value="${m.id}">
                              ${m.providerModelId} (${m.tokens} tokens)
                            </option>`
                        )}
                      </select>
                    </div>
                    <div>
                      <label for="news-limit">News Limit</label>
                      <input
                        type="number"
                        id="news-limit"
                        value="300"
                        min="1"
                        max="300"
                        onchange="previewNews()"
                      />
                    </div>
                  </div>
                  <div class="form-row">
                    <div>
                      <label for="news-after">News After</label>
                      <input
                        type="datetime-local"
                        id="news-after"
                        onchange="previewNews()"
                      />
                    </div>
                    <div>
                      <label for="news-before">News Before</label>
                      <input
                        type="datetime-local"
                        id="news-before"
                        onchange="previewNews()"
                      />
                    </div>
                  </div>

                  <div class="news-preview-panel">
                    <h3
                      style="font-size: 0.75rem; color: var(--text-dim); margin-bottom: 12px; display: flex; justify-content: space-between;"
                    >
                      <span>NEWS SELECTION</span>
                      <span id="news-count-badge">Loading...</span>
                    </h3>
                    <div id="news-list"></div>
                    <button
                      id="news-more-btn"
                      class="news-more-btn"
                      style="display: none;"
                      onclick="toggleNews()"
                    >
                      Show More
                    </button>
                  </div>
                </div>

                <div class="panel" style="margin-top: 16px;">
                  <h2>System Prompt</h2>
                  <textarea id="prompt">${DEFAULT_PROMPT}</textarea>
                  <button class="btn-run" id="run-btn" onclick="runTest()">
                    ▶ Run Test Simulation
                  </button>
                </div>

                <div class="loading" id="loading">
                  <div class="spinner"></div>
                  <span
                    >Executing agent simulation... this may take up to a
                    minute</span
                  >
                </div>
                <div class="error-box" id="error-box"></div>

                <div id="results">
                  <div class="result-header">
                    <h2>Results</h2>
                    <span class="result-meta" id="result-meta"></span>
                  </div>
                  <div id="steps-container"></div>
                </div>
              </div>

              <div>
                <div class="panel sidebar-section">
                  <h3>Available Variables</h3>
                  <p
                    style="font-size: 0.72rem; color: var(--text-dim); margin-bottom: 10px;"
                  >
                    Click to insert into prompt. These are automatically
                    replaced during execution.
                  </p>
                  ${AVAILABLE_VARIABLES.map(
                    (v) => html`
                      <div class="var-item" onclick="insertVar('${v.name}')">
                        <code>\${${v.name}}</code>
                        <div class="desc">${v.desc}</div>
                      </div>
                    `
                  )}
                </div>
                <div class="panel sidebar-section">
                  <h3>Available Tools</h3>
                  <p
                    style="font-size: 0.72rem; color: var(--text-dim); margin-bottom: 10px;"
                  >
                    Agent can use all these tools. No side-effects in test mode.
                  </p>
                  ${AVAILABLE_TOOLS.map(
                    (t) => html`
                      <div class="tool-item">
                        <div class="tool-name">${t.name}</div>
                        <div class="tool-desc">${t.desc}</div>
                      </div>
                    `
                  )}
                </div>
              </div>
            </div>
          </div>

          <script>
            let allNewsData = [];
            let newsShowingAll = false;

            function insertVar(name) {
              const ta = document.getElementById("prompt");
              const pos = ta.selectionStart;
              const before = ta.value.substring(0, pos);
              const after = ta.value.substring(ta.selectionEnd);
              const insert = "\${" + name + "}";
              ta.value = before + insert + after;
              ta.focus({ preventScroll: true });
              ta.selectionStart = ta.selectionEnd = pos + insert.length;
            }

            async function previewNews() {
              const badge = document.getElementById("news-count-badge");
              const list = document.getElementById("news-list");
              const moreBtn = document.getElementById("news-more-btn");

              badge.textContent = "Updating...";

              const body = {
                newsLimit:
                  parseInt(document.getElementById("news-limit").value) || 300
              };
              const newsAfter = document.getElementById("news-after").value;
              const newsBefore = document.getElementById("news-before").value;
              if (newsAfter) body.newsAfter = new Date(newsAfter).toISOString();
              if (newsBefore)
                body.newsBefore = new Date(newsBefore).toISOString();

              try {
                const res = await fetch("/playground/news-preview", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body)
                });
                const data = await res.json();
                allNewsData = data.data;
                badge.textContent = allNewsData.length + " items selected";

                renderNews();
              } catch (e) {
                badge.textContent = "Error fetching news";
              }
            }

            function renderNews() {
              const list = document.getElementById("news-list");
              const moreBtn = document.getElementById("news-more-btn");

              const items = newsShowingAll
                ? allNewsData
                : allNewsData.slice(0, 5);

              list.innerHTML = items
                .map(
                  (n) => \`
                <div class="news-item">
                  <div class="news-title">\${escapeHtml(n.title)}</div>
                  <div class="news-meta">\${n.category} • \${new Date(n.publishedAt).toLocaleString()}</div>
                </div>
              \`
                )
                .join("");

              if (allNewsData.length > 5) {
                moreBtn.style.display = "block";
                moreBtn.textContent = newsShowingAll
                  ? "Show Less"
                  : "Show More (" + (allNewsData.length - 5) + " more)";
              } else {
                moreBtn.style.display = "none";
              }
            }

            function toggleNews() {
              newsShowingAll = !newsShowingAll;
              renderNews();
            }

            async function runTest() {
              const btn = document.getElementById("run-btn");
              const loading = document.getElementById("loading");
              const results = document.getElementById("results");
              const errorBox = document.getElementById("error-box");
              const stepsContainer = document.getElementById("steps-container");
              const resultMeta = document.getElementById("result-meta");

              btn.disabled = true;
              loading.classList.add("visible");
              results.classList.remove("visible");
              errorBox.style.display = "none";
              stepsContainer.innerHTML = "";

              const body = {
                modelId: parseInt(
                  document.getElementById("model-select").value
                ),
                systemPrompt: document.getElementById("prompt").value,
                newsLimit:
                  parseInt(document.getElementById("news-limit").value) || 300
              };

              const newsAfter = document.getElementById("news-after").value;
              const newsBefore = document.getElementById("news-before").value;
              if (newsAfter) body.newsAfter = new Date(newsAfter).toISOString();
              if (newsBefore)
                body.newsBefore = new Date(newsBefore).toISOString();

              try {
                console.log("Sending request to /playground/run", body);
                const res = await fetch("/playground/run", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body)
                });

                if (!res.ok) {
                  const err = await res
                    .json()
                    .catch(() => ({ message: "Unknown error" }));
                  throw new Error(err.message || "Request failed");
                }

                const data = await res.json();
                console.log("Received response", data);
                resultMeta.textContent =
                  data.model.providerModelId +
                  " — " +
                  data.newsCount +
                  " news items — " +
                  data.totalSteps +
                  " steps";

                data.steps.forEach((step, i) => {
                  const card = document.createElement("div");
                  card.className =
                    "step-card" + (i === data.steps.length - 1 ? " open" : "");

                  const toolNames =
                    step.toolCalls.map((tc) => tc.toolName).join(", ") ||
                    "text only";

                  let bodyHtml = "";
                  if (step.text)
                    bodyHtml +=
                      '<div class="step-text">' +
                      escapeHtml(step.text) +
                      "</div>";
                  step.toolResults.forEach((tr) => {
                    bodyHtml +=
                      '<div class="tool-result-block"><div class="tool-label">← ' +
                      tr.toolName +
                      ' result</div><pre class="json">' +
                      escapeHtml(JSON.stringify(tr.output, null, 2)) +
                      "</pre></div>";
                  });

                  card.innerHTML =
                    '<div class="step-header" onclick="this.parentElement.classList.toggle(\\'open\\')"><span class="step-num">' +
                    (i + 1) +
                    "</span> Step " +
                    (i + 1) +
                    " — " +
                    toolNames +
                    '</div><div class="step-body">' +
                    bodyHtml +
                    "</div>";
                  stepsContainer.appendChild(card);
                });

                results.classList.add("visible");
                results.scrollIntoView({ behavior: "smooth" });
              } catch (e) {
                console.error("Run failed", e);
                errorBox.textContent = "⚠ " + e.message;
                errorBox.style.display = "block";
              } finally {
                btn.disabled = false;
                loading.classList.remove("visible");
              }
            }

            function escapeHtml(str) {
              if (!str) return "";
              const div = document.createElement("div");
              div.textContent = str;
              return div.innerHTML;
            }

            // Tab key in textarea
            document
              .getElementById("prompt")
              .addEventListener("keydown", function (e) {
                if (e.key === "Tab") {
                  e.preventDefault();
                  const s = this.selectionStart;
                  this.value =
                    this.value.substring(0, s) +
                    "  " +
                    this.value.substring(this.selectionEnd);
                  this.selectionStart = this.selectionEnd = s + 2;
                }
              });

            // Initial news preview
            previewNews();
          </script>
        </body>
      </html>`
  );
});

router.post(
  "/news-preview",
  zValidator(
    "json",
    z.object({
      newsAfter: z.string().optional(),
      newsBefore: z.string().optional(),
      newsLimit: z.number().min(1).max(300).optional()
    })
  ),
  async (c) => {
    const { newsAfter, newsBefore, newsLimit = 300 } = c.req.valid("json");

    const afterDate = newsAfter ? new Date(newsAfter) : undefined;
    const beforeDate = newsBefore ? new Date(newsBefore) : undefined;

    const filteredNews = (
      await NewsService.getNews({
        limit: newsLimit,
        after: afterDate,
        before: beforeDate
      })
    ).data;

    return c.json({ data: filteredNews });
  }
);

router.post(
  "/run",
  zValidator(
    "json",
    z.object({
      modelId: z.number(),
      systemPrompt: z.string().min(1),
      newsAfter: z.string().optional(),
      newsBefore: z.string().optional(),
      newsLimit: z.number().min(1).max(300).optional()
    })
  ),
  async (c) => {
    const { modelId, systemPrompt, newsAfter, newsBefore, newsLimit } =
      c.req.valid("json");

    const result = await PredictionService.runTestPrediction({
      modelId,
      systemPrompt,
      newsAfter,
      newsBefore,
      newsLimit
    });

    return c.json(result);
  }
);

export default router;
