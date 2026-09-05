import { buildFrameOrder, framingExpectedOutcomes } from "../logic.mjs";
import { createTaskSession, downloadRowsCsv } from "../shared.mjs";
import { seededRandom } from "../../../assets/random.mjs";

const options = {
  gain: [{ value: "sure", label: "計画A：200本が助かる。" }, { value: "risky", label: "計画B：1/3の確率で600本すべてが助かり、2/3の確率で1本も助からない。" }],
  loss: [{ value: "sure", label: "計画A：400本が失われる。" }, { value: "risky", label: "計画B：1/3の確率で1本も失われず、2/3の確率で600本すべてが失われる。" }],
};
let order = [];
let index = 0;
let rows = [];
let startedAt = 0;
let session;
let mode = "both";

function renderFrame() {
  const frame = order[index];
  document.querySelector("#frame-number").textContent = `提示 ${index + 1} / ${order.length}`;
  document.querySelector("#frame-comparison-note").textContent = order.length === 2 ? "2つの回答後に比較" : "クラス集計用の1条件";
  document.querySelector("#frame-options").innerHTML = options[frame].map((option) => `<label><input type="radio" name="answer" value="${option.value}"> ${option.label}</label>`).join("");
  document.querySelector(".question-error").textContent = "";
  startedAt = performance.now();
}

function start() {
  session = createTaskSession("framing", "1.3.0");
  const random = seededRandom(session.session_id);
  order = mode === "both" ? buildFrameOrder(random) : [random() < 0.5 ? "gain" : "loss"];
  index = 0; rows = [];
  document.querySelector("#question").hidden = false; renderFrame();
  document.querySelector("#question").scrollIntoView({ behavior: "smooth", block: "start" });
}

function finish() {
  const gain = rows.find((row) => row.frame_condition === "gain");
  const loss = rows.find((row) => row.frame_condition === "loss");
  const label = (response) => response === "sure" ? "確実な計画A" : "確率的な計画B";
  document.querySelector("#question").hidden = true;
  if (rows.length === 2) {
    const same = gain.response === loss.response;
    document.querySelector("#result-summary").innerHTML = `<strong>${same ? "2つの表現で同じ計画を選びました" : "表現によって選択が変わりました"}</strong><p>利得表現：${label(gain.response)} ／ 損失表現：${label(loss.response)}</p>`;
  } else {
    const row = rows[0];
    document.querySelector("#result-summary").innerHTML = `<strong>${label(row.response)}を選びました</strong><p>提示条件：${row.frame_condition === "gain" ? "利得（助かる）" : "損失（失われる）"}フレーム</p>`;
  }
  document.querySelector("#result-explanation").innerHTML = `<h2>2つの表現は結果として対応しています</h2><p>計画Aは「200本が助かる」と「400本が失われる」が同じ結果です。計画Bも「1/3で全て助かる」と「1/3で何も失われない」が対応します。期待される本数はどちらの計画も200本が助かり、400本が失われます。</p><p>${rows.length === 2 ? "個人内では2表現で回答が同じかを確認できますが、反復提示による記憶や整合性要求も影響します。" : "この回答だけではフレーミング効果を判定できません。クラスのCSVを利得条件と損失条件に分け、選択割合を比較してください。"}</p>`;
  document.querySelector("#results").hidden = false;
  document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
}

document.querySelector("#config-form").addEventListener("submit", (event) => {
  event.preventDefault();
  mode = new FormData(event.currentTarget).get("mode");
  start();
});
document.querySelector("#answer-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const answer = new FormData(event.currentTarget).get("answer");
  if (!answer) { document.querySelector(".question-error").textContent = "計画を1つ選んでください。"; return; }
  const expected = framingExpectedOutcomes();
  rows.push({ ...session, mode, presentation_order: index + 1, frame_condition: order[index], response: answer, expected_saved_a: expected.optionAExpectedSaved, expected_saved_b: expected.optionBExpectedSaved, expected_lost_a: expected.optionAExpectedLost, expected_lost_b: expected.optionBExpectedLost, rt: Number((performance.now() - startedAt).toFixed(3)) });
  index += 1;
  if (index === order.length) finish(); else renderFrame();
});
document.querySelector("#download-csv").addEventListener("click", () => downloadRowsCsv("framing", rows));
document.querySelector("#retry-task").addEventListener("click", () => window.location.reload());
document.querySelector("#back-category").addEventListener("click", () => { window.location.href = "../"; });
