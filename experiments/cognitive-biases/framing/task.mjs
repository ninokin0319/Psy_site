import { buildFrameOrder, framingExpectedOutcomes } from "../logic.mjs";
import { createTaskSession, downloadRowsCsv } from "../shared.mjs";

const options = {
  gain: [{ value: "sure", label: "計画A：200本が助かる。" }, { value: "risky", label: "計画B：1/3の確率で600本すべてが助かり、2/3の確率で1本も助からない。" }],
  loss: [{ value: "sure", label: "計画A：400本が失われる。" }, { value: "risky", label: "計画B：1/3の確率で1本も失われず、2/3の確率で600本すべてが失われる。" }],
};
let order = [];
let index = 0;
let rows = [];
let startedAt = 0;
let session;

function renderFrame() {
  const frame = order[index];
  document.querySelector("#frame-number").textContent = `提示 ${index + 1} / 2`;
  document.querySelector("#frame-options").innerHTML = options[frame].map((option) => `<label><input type="radio" name="answer" value="${option.value}"> ${option.label}</label>`).join("");
  document.querySelector(".question-error").textContent = "";
  startedAt = performance.now();
}

function start() {
  order = buildFrameOrder(); index = 0; rows = []; session = createTaskSession("framing", "1.1.0");
  document.querySelector("#question").hidden = false; renderFrame();
  document.querySelector("#question").scrollIntoView({ behavior: "smooth", block: "start" });
}

function finish() {
  const gain = rows.find((row) => row.frame_condition === "gain");
  const loss = rows.find((row) => row.frame_condition === "loss");
  const same = gain.response === loss.response;
  const label = (response) => response === "sure" ? "確実な計画A" : "確率的な計画B";
  document.querySelector("#question").hidden = true;
  document.querySelector("#result-summary").innerHTML = `<strong>${same ? "2つの表現で同じ計画を選びました" : "表現によって選択が変わりました"}</strong><p>利得表現：${label(gain.response)} ／ 損失表現：${label(loss.response)}</p>`;
  document.querySelector("#result-explanation").innerHTML = `<h2>2つの表現は結果として対応しています</h2><p>計画Aは「200本が助かる」と「400本が失われる」が同じ結果です。計画Bも「1/3で全て助かる」と「1/3で何も失われない」が対応します。期待される本数はどちらの計画も200本が助かり、400本が失われます。</p><p>計画AとBは結果のばらつきが異なるため、選択に単一の正解はありません。この個人内デモでは2表現で回答が同じかを確認できますが、フレーミング効果の推定には提示順や反復の影響を統制した集団比較が必要です。</p>`;
  document.querySelector("#results").hidden = false;
  document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
}

document.querySelector("#start-task").addEventListener("click", start);
document.querySelector("#answer-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const answer = new FormData(event.currentTarget).get("answer");
  if (!answer) { document.querySelector(".question-error").textContent = "計画を1つ選んでください。"; return; }
  const expected = framingExpectedOutcomes();
  rows.push({ ...session, presentation_order: index + 1, frame_condition: order[index], response: answer, expected_saved_a: expected.optionAExpectedSaved, expected_saved_b: expected.optionBExpectedSaved, expected_lost_a: expected.optionAExpectedLost, expected_lost_b: expected.optionBExpectedLost, rt: Number((performance.now() - startedAt).toFixed(3)) });
  index += 1;
  if (index === 2) finish(); else renderFrame();
});
document.querySelector("#download-csv").addEventListener("click", () => downloadRowsCsv("framing", rows));
document.querySelector("#retry-task").addEventListener("click", () => window.location.reload());
document.querySelector("#back-category").addEventListener("click", () => { window.location.href = "../"; });
