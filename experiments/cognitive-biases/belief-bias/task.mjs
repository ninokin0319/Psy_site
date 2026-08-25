import { buildSyllogismSequence, scoreSyllogism } from "../logic.mjs";
import { createTaskSession, downloadRowsCsv } from "../shared.mjs";

let items = [];
let index = 0;
let responses = [];
let startedAt = 0;
let session;

function renderItem() {
  const item = items[index];
  document.querySelector("#question-number").textContent = `問題 ${index + 1} / ${items.length}`;
  document.querySelector("#syllogism").innerHTML = `<p><strong>前提1：</strong>${item.premises[0]}</p><p><strong>前提2：</strong>${item.premises[1]}</p><p><strong>結論：</strong>${item.conclusion}</p>`;
  document.querySelector("#answer-form").reset();
  document.querySelector(".question-error").textContent = "";
  startedAt = performance.now();
}

function start() {
  items = buildSyllogismSequence();
  index = 0;
  responses = [];
  session = createTaskSession("belief-bias", "1.1.0");
  document.querySelector("#question").hidden = false;
  renderItem();
  document.querySelector("#question").scrollIntoView({ behavior: "smooth", block: "start" });
}

function finish() {
  document.querySelector("#question").hidden = true;
  const correctCount = responses.filter((row) => row.correctness === 1).length;
  const targetRows = responses.filter((row) => row.target_item === 1);
  const targetCorrect = targetRows.filter((row) => row.correctness === 1).length;
  document.querySelector("#result-summary").innerHTML = `<strong>${correctCount} / ${responses.length}問が論理形式と一致</strong><p>信念と論理が競合するターゲット項目：${targetCorrect} / ${targetRows.length}問</p>`;
  document.querySelector("#answer-review").innerHTML = items.map((item, order) => {
    const row = responses[order];
    const responseLabel = row.response === "valid" ? "妥当" : "妥当でない";
    const correctLabel = item.correctResponse === "valid" ? "妥当" : "妥当でない";
    return `<article class="review-item"><p class="eyebrow">問題 ${order + 1}${item.target ? " · 信念と論理が競合" : ""}</p><h3>${row.correctness ? "論理形式と一致" : "要復習"}</h3><p><strong>あなたの回答：</strong>${responseLabel}　<strong>規範解：</strong>${correctLabel}</p><div class="question-prompt"><p>${item.premises[0]}</p><p>${item.premises[1]}</p><p>${item.conclusion}</p></div><p>${item.explanation}</p></article>`;
  }).join("");
  document.querySelector("#results").hidden = false;
  document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
}

document.querySelector("#start-task").addEventListener("click", start);
document.querySelector("#answer-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const answer = new FormData(event.currentTarget).get("answer");
  if (!answer) { document.querySelector(".question-error").textContent = "どちらかを選んでください。"; return; }
  const item = items[index];
  responses.push({ ...session, item_order: index + 1, item_id: item.id, logical_validity: item.validity, conclusion_believability: item.believability, target_item: item.target ? 1 : 0, response: answer, correctness: scoreSyllogism(item, answer) ? 1 : 0, rt: Number((performance.now() - startedAt).toFixed(3)) });
  index += 1;
  if (index >= items.length) finish(); else renderItem();
});
document.querySelector("#download-csv").addEventListener("click", () => downloadRowsCsv("belief-bias", responses));
document.querySelector("#retry-task").addEventListener("click", () => window.location.reload());
document.querySelector("#back-category").addEventListener("click", () => { window.location.href = "../"; });
