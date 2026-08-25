import { getAnchor } from "../logic.mjs";
import { createTaskSession, finishSingleQuestion } from "../shared.mjs";

const actual = 1872;
let anchor;
let startedAt;

document.querySelector("#config-form").addEventListener("submit", (event) => {
  event.preventDefault();
  anchor = getAnchor(new FormData(event.currentTarget).get("anchorCondition"));
  startedAt = performance.now();
  document.querySelector("#anchor-value").textContent = anchor.value;
  document.querySelector("#question").hidden = false;
  document.querySelector("#question").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelector("#answer-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const comparison = data.get("comparison");
  const estimate = Number(data.get("estimate"));
  if (!comparison || !Number.isFinite(estimate) || estimate < 1500 || estimate > 2100) {
    document.querySelector(".question-error").textContent = "比較判断と1500〜2100年の推定値を入力してください。";
    return;
  }
  const row = { ...createTaskSession("anchoring", "1.1.0"), anchor_condition: anchor.condition, anchor_value: anchor.value, comparison_response: comparison, comparison_correctness: comparison === (actual < anchor.value ? "before" : "after") ? 1 : 0, estimate_year: estimate, actual_year: actual, signed_error: estimate - actual, absolute_error: Math.abs(estimate - actual), rt: Number((performance.now() - startedAt).toFixed(3)) };
  finishSingleQuestion({ taskId: "anchoring", row, summaryHtml: `<strong>あなたの推定：${estimate}年</strong><p>提示された基準：${anchor.value}年（${anchor.condition === "low" ? "低" : "高"}アンカー）／実際：1872年</p>`, explanationHtml: `<h2>条件間で比較する課題です</h2><p>実際には1872年10月14日に新橋―横浜間で日本初の鉄道が開業しました。あなたの推定誤差は${estimate - actual >= 0 ? "+" : ""}${estimate - actual}年です。</p><p>重要なのは個人の誤差ではなく、高アンカー条件と低アンカー条件の平均推定年の差です。知識がある参加者ではアンカーの影響が小さくなる可能性があります。</p>` });
});

document.querySelector("#retry-task").addEventListener("click", () => window.location.reload());
document.querySelector("#back-category").addEventListener("click", () => { window.location.href = "../"; });
