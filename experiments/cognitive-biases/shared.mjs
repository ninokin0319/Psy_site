import { createRowsCsv, createSessionId, createSingleRowCsv } from "./logic.mjs";

export function createTaskSession(taskId, version = "1.0.0") {
  const sessionId = createSessionId();
  return { experiment_id: taskId, experiment_version: version, session_id: sessionId, random_seed: sessionId, recorded_at: new Date().toISOString() };
}

export function revealQuestion() {
  document.querySelector("#question").hidden = false;
  document.querySelector("#question").scrollIntoView({ behavior: "smooth", block: "start" });
}

export function finishSingleQuestion({ taskId, row, summaryHtml, explanationHtml }) {
  document.querySelector("#question").hidden = true;
  const results = document.querySelector("#results");
  results.querySelector("#result-summary").innerHTML = summaryHtml;
  results.querySelector("#result-explanation").innerHTML = explanationHtml;
  results.hidden = false;
  results.scrollIntoView({ behavior: "smooth", block: "start" });
  const download = results.querySelector("#download-csv");
  download.onclick = () => {
    const blob = new Blob([createSingleRowCsv(row)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${taskId}_${new Date().toISOString().replaceAll(":", "-")}_${row.session_id}.csv`;
    document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}

export function downloadRowsCsv(taskId, rows) {
  const blob = new Blob([createRowsCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${taskId}_${new Date().toISOString().replaceAll(":", "-")}_${rows[0]?.session_id ?? "session"}.csv`;
  document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function wireCommonButtons(start) {
  document.querySelector("#start-task").addEventListener("click", () => { start(); revealQuestion(); });
  document.querySelector("#retry-task").addEventListener("click", () => window.location.reload());
  document.querySelector("#back-category").addEventListener("click", () => { window.location.href = "../"; });
}
