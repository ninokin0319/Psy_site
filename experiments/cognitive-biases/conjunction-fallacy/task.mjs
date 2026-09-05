import { conjunctionIsCorrect } from "../logic.mjs";
import { createTaskSession, finishSingleQuestion, wireCommonButtons } from "../shared.mjs";
import { seededRandom } from "../../../assets/random.mjs";

let startedAt;
let order;
let session;
const choices = [
  { value: "single", text: "リンダは銀行の窓口係である。" },
  { value: "conjunction", text: "リンダは銀行の窓口係であり、フェミニスト運動に積極的である。" },
];

function start() {
  session = createTaskSession("conjunction-fallacy", "1.2.0");
  startedAt = performance.now();
  order = seededRandom(session.session_id)() < 0.5 ? choices : [...choices].reverse();
  document.querySelector("#choices").innerHTML = order.map((choice) => `<label><input type="radio" name="answer" value="${choice.value}"> ${choice.text}</label>`).join("");
}

wireCommonButtons(start);
document.querySelector("#answer-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const answer = new FormData(event.currentTarget).get("answer");
  if (!answer) { document.querySelector(".question-error").textContent = "どちらかを選んでください。"; return; }
  const correct = conjunctionIsCorrect(answer);
  const data = new FormData(event.currentTarget);
  const familiarity = data.get("familiarity");
  if (!familiarity) { document.querySelector(".question-error").textContent = "この問題を以前から知っていたか選んでください。"; return; }
  const row = { ...session, item: "linda_problem", prior_familiarity: familiarity, response: answer, correctness: correct ? 1 : 0, option_order: order.map((item) => item.value).join("|"), rt: Number((performance.now() - startedAt).toFixed(3)) };
  finishSingleQuestion({ taskId: "conjunction-fallacy", row, summaryHtml: `<strong>${correct ? "連言規則に一致した回答です" : "連言事象を高確率と判断しました"}</strong>`, explanationHtml: `<h2>確率の包含関係</h2><p>「銀行の窓口係で、かつフェミニスト運動に積極的」な人は、必ず「銀行の窓口係」の集合に含まれます。そのため、人物像にもっと合って見えても、連言事象の確率が単独事象を上回ることはありません。</p><p>もっともらしさによる判断に加え、質問文や「かつ」の解釈も回答に影響しうるため、1問の回答だけを個人特性として解釈しません。</p>` });
});
