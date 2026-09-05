import { compatibilityReport, inspectDataset, mergeDatasets, parseCsv } from "./logic.mjs";

const fileInput = document.querySelector("#csv-files");
const dropZone = document.querySelector("#drop-zone");
const summary = document.querySelector("#import-summary");
const fileBody = document.querySelector("#file-body");
const downloadButton = document.querySelector("#download-merged");
let datasets = [];

function render() {
  const report = compatibilityReport(datasets);
  const totalRows = datasets.reduce((sum, item) => sum + item.rowCount, 0);
  const totalSessions = datasets.reduce((sum, item) => sum + item.sessionCount, 0);
  summary.innerHTML = datasets.length === 0
    ? "<strong>CSVはまだ読み込まれていません。</strong><p>同じ実験・同じバージョン・同じ列構成のファイルを選択してください。</p>"
    : `<strong>${datasets.length}ファイル・${totalRows}行・延べ${totalSessions}セッション</strong><p>${report.compatible ? "結合できます。" : report.messages.join(" ")}</p>`;
  summary.classList.toggle("is-error", datasets.length > 0 && !report.compatible);
  fileBody.innerHTML = datasets.map((item) => `<tr><td>${item.name}</td><td>${item.experimentId}</td><td>${item.version}</td><td>${item.sessionCount}</td><td>${item.rowCount}</td></tr>`).join("");
  downloadButton.disabled = !report.compatible;
}

async function loadFiles(files) {
  const next = [];
  for (const file of files) {
    try {
      next.push(inspectDataset(file.name, parseCsv(await file.text())));
    } catch (error) {
      next.push({ name: file.name, headers: [], records: [], experimentId: "読込エラー", version: error.message, sessionCount: 0, rowCount: 0 });
    }
  }
  datasets = next;
  render();
}

fileInput.addEventListener("change", () => loadFiles(fileInput.files));
dropZone.addEventListener("dragover", (event) => { event.preventDefault(); dropZone.classList.add("is-dragging"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragging"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragging");
  loadFiles([...event.dataTransfer.files].filter((file) => file.name.toLowerCase().endsWith(".csv")));
});
downloadButton.addEventListener("click", () => {
  const csv = mergeDatasets(datasets);
  const experiment = datasets[0].experimentId.replace(/[^a-z0-9_-]+/gi, "-") || "experiment";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${experiment}_class_${new Date().toISOString().replaceAll(":", "-")}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});

render();
