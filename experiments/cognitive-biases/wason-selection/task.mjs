import { WASON_SCENARIOS, getWasonScenario, scoreWason } from "../logic.mjs";
import { createTaskSession, finishSingleQuestion } from "../shared.mjs";

let scenario;
let startedAt;

function renderScenario() {
  document.querySelector("#scenario-title").textContent = scenario.title;
  document.querySelector("#scenario-prompt").innerHTML = `<p>${scenario.context}</p><p>検証する規則：<strong>「${scenario.rule}」</strong></p><p>規則違反がないか確かめるため、必要最小限のカードを選んでください。</p>`;
  document.querySelector("#card-options").innerHTML = scenario.cards.map((card) => `<label class="card-choice"><input type="checkbox" name="card" value="${card.id}"><span class="card-face">${card.label}</span></label>`).join("");
}

document.querySelector("#config-form").addEventListener("submit", (event) => {
  event.preventDefault();
  scenario = getWasonScenario(new FormData(event.currentTarget).get("scenario"));
  renderScenario(); startedAt = performance.now();
  document.querySelector("#question").hidden = false;
  document.querySelector("#question").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelector("#answer-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const selected = new FormData(event.currentTarget).getAll("card");
  if (selected.length === 0) { document.querySelector(".question-error").textContent = "少なくとも1枚選んでください。"; return; }
  const correct = scoreWason(selected, scenario.id);
  const selectedLabels = scenario.cards.filter((card) => selected.includes(card.id)).map((card) => card.label);
  const expectedLabels = scenario.cards.filter((card) => scenario.correct.includes(card.id)).map((card) => card.label);
  const row = { ...createTaskSession("wason-selection", "1.1.0"), scenario_id: scenario.id, source_task: scenario.source, rule: scenario.rule, selected_cards: selected.join("|"), expected_cards: scenario.correct.join("|"), selected_roles: scenario.cards.filter((card) => selected.includes(card.id)).map((card) => card.role).join("|"), correctness: correct ? 1 : 0, rt: Number((performance.now() - startedAt).toFixed(3)) };
  const review = Object.values(WASON_SCENARIOS).map((item) => {
    const answer = item.cards.filter((card) => item.correct.includes(card.id)).map((card) => card.label).join("、");
    return `<article class="scenario-review">${item.id === scenario.id ? '<span class="condition-badge">今回回答した課題</span>' : ""}<h3>${item.title}</h3><p class="scenario-rule">${item.rule}</p><p><strong>確認するカード：</strong>${answer}</p><p>${item.explanation}</p><small>${item.source}</small></article>`;
  }).join("");
  document.querySelector("#scenario-review").innerHTML = review;
  finishSingleQuestion({ taskId: "wason-selection", row, summaryHtml: `<strong>${correct ? "必要な2枚を選びました" : "反例を見つける2枚を確認しましょう"}</strong><p>あなたの選択：${selectedLabels.join("、")} ／ 規範解：${expectedLabels.join("、")}</p>`, explanationHtml: document.querySelector("#results .result-explanation").innerHTML });
});

document.querySelector("#retry-task").addEventListener("click", () => window.location.reload());
document.querySelector("#back-category").addEventListener("click", () => { window.location.href = "../"; });
