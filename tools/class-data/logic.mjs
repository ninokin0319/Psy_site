export function parseCsv(text) {
  const source = String(text).replace(/^\ufeff/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field !== "" || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((value) => value !== "")) rows.push(row);
  }
  if (quoted) throw new Error("引用符が閉じられていません。");
  if (rows.length === 0) throw new Error("CSVが空です。");
  const headers = rows[0];
  if (new Set(headers).size !== headers.length) throw new Error("同じ列名が重複しています。");
  const records = rows.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length) throw new Error(`${rowIndex + 2}行目の列数が一致しません。`);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
  return { headers, records };
}
export function inspectDataset(name, parsed) {
  const experimentIds = [...new Set(parsed.records.map((row) => row.experiment_id).filter(Boolean))];
  const versions = [...new Set(parsed.records.map((row) => row.experiment_version).filter(Boolean))];
  const sessions = [...new Set(parsed.records.map((row) => row.session_id).filter(Boolean))];
  return {
    name,
    headers: parsed.headers,
    records: parsed.records,
    experimentId: experimentIds.length === 1 ? experimentIds[0] : experimentIds.join(" / ") || "不明",
    version: versions.length === 1 ? versions[0] : versions.join(" / ") || "不明",
    sessionCount: sessions.length,
    rowCount: parsed.records.length,
  };
}

export function compatibilityReport(datasets) {
  if (datasets.length === 0) return { compatible: false, messages: ["CSVを選択してください。"] };
  const messages = [];
  const headerKey = (headers) => headers.join("\u001f");
  if (new Set(datasets.map((item) => headerKey(item.headers))).size > 1) messages.push("列名または列順が異なるCSVが含まれています。");
  if (new Set(datasets.map((item) => item.experimentId)).size > 1) messages.push("異なる実験のCSVが含まれています。");
  if (new Set(datasets.map((item) => item.version)).size > 1) messages.push("異なる実験バージョンのCSVが含まれています。");
  if (datasets.some((item) => item.rowCount === 0)) messages.push("データ行がないCSVが含まれています。");
  return { compatible: messages.length === 0, messages };
}

function quoteCsv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function mergeDatasets(datasets) {
  const report = compatibilityReport(datasets);
  if (!report.compatible) throw new Error(report.messages.join(" "));
  const headers = datasets[0].headers;
  const rows = datasets.flatMap((dataset) => dataset.records);
  const lines = rows.map((row) => headers.map((header) => quoteCsv(row[header])).join(","));
  return `\ufeff${headers.map(quoteCsv).join(",")}\r\n${lines.join("\r\n")}\r\n`;
}
