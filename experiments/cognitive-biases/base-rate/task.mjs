import { posteriorProbability, shuffleItems } from "../logic.mjs";
import { createTaskSession, finishSingleQuestion } from "../shared.mjs";
import { seededRandom } from "../../../assets/random.mjs";

const options = [10, 31, 80, 90];
let order = [];
let representation = "probability";
let startedAt = 0;
let session;

function promptHtml(condition) {
  if (condition === "frequency") {
    return "<p>1000個の製品のうち、工場A製は900個、工場B製は100個です。</p><p>B製100個のうち80個に「Z」と表示されます。A製900個のうち180個にも「Z」と表示されます。</p><p>「Z」と表示された製品が工場B製である確率に最も近いものを選んでください。</p>";
  }
  return "<p>製品の<strong>90%</strong>は工場A、<strong>10%</strong>は工場Bで作られています。</p><p>識別装置はB製品の<strong>80%</strong>に「Z」と表示し、A製品にも<strong>20%</strong>の割合で誤って「Z」と表示します。</p><p>1個の製品に「Z」と表示されました。この製品が工場B製である確率に最も近いものを選んでください。</p>";
}

document.querySelector("#config-form").addEventListener("submit", (event) => {
  event.preventDefault();
  session = createTaskSession("base-rate", "1.1.0");
  const random = seededRandom(session.session_id);
  const requested = new FormData(event.currentTarget).get("representation");
  representation = requested === "random" ? (random() < 0.5 ? "probability" : "frequency") : requested;
  order = shuffleItems(options, random);
  document.querySelector("#base-rate-prompt").innerHTML = promptHtml(representation);
  document.querySelector("#choices").innerHTML = order.map((value) => `<label><input type="radio" name="answer" value="${value}"> 約${value}%</label>`).join("");
  document.querySelector("#question").hidden = false;
  document.querySelector("#question").scrollIntoView({ behavior: "smooth", block: "start" });
  startedAt = performance.now();
});

document.querySelector("#answer-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const answer = Number(new FormData(event.currentTarget).get("answer"));
  if (!answer) {
    document.querySelector(".question-error").textContent = "確率を1つ選んでください。";
    return;
  }
  const posterior = posteriorProbability({ baseTarget: 0.1, sensitivity: 0.8, falsePositiveRate: 0.2 });
  const correct = answer === 31;
  const row = {
    ...session,
    representation,
    base_rate_b: 0.1,
    sensitivity: 0.8,
    false_positive_rate: 0.2,
    response_percent: answer,
    normative_percent: Number((posterior * 100).toFixed(3)),
    correctness: correct ? 1 : 0,
    option_order: order.join("|"),
    rt: Number((performance.now() - startedAt).toFixed(3)),
  };
  finishSingleQuestion({
    taskId: "base-rate",
    row,
    summaryHtml: `<strong>${correct ? "Bayesの定理による値に最も近い回答です" : "基準率を含めて計算してみましょう"}</strong><p>提示形式：${representation === "frequency" ? "自然頻度" : "確率"}／規範的な事後確率：約30.8%</p>`,
    explanationHtml: '<h2>1000個で考える</h2><div class="probability-work"><table><thead><tr><th></th><th>製品数</th><th>「Z」と表示</th></tr></thead><tbody><tr><th>工場B</th><td>100</td><td>80</td></tr><tr><th>工場A</th><td>900</td><td>180</td></tr></tbody></table></div><p>「Z」は合計260個で、そのうちB製は80個です。したがって 80 ÷ 260 ≈ 30.8% です。80%はB製品にZが出る確率であり、Zが出たときB製である逆向きの確率とは異なります。</p><p>同じ数量関係でも、確率と自然頻度のどちらで提示したかによって推論のしやすさが変わる可能性があります。授業では提示形式別の回答分布を比較してください。</p>',
  });
});

document.querySelector("#retry-task").addEventListener("click", () => window.location.reload());
document.querySelector("#back-category").addEventListener("click", () => { window.location.href = "../"; });
