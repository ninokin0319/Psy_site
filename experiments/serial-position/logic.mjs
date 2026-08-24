const KANA = Object.freeze(["ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク", "ケ", "コ", "サ", "シ", "ス", "セ", "ソ", "タ", "チ", "ツ", "テ", "ト", "ナ", "ニ", "ヌ", "ネ", "ノ", "ハ", "ヒ", "フ", "ヘ", "ホ", "マ", "ミ", "ム", "メ", "モ", "ヤ", "ユ", "ヨ", "ラ", "リ", "ル", "レ", "ロ", "ワ"]);

export const SERIAL_CSV_COLUMNS = Object.freeze([
  "experiment_id", "experiment_version", "session_id", "recorded_at", "list_index",
  "serial_position", "item", "recalled", "recall_order", "response_count", "recall_rt",
  "list_length", "list_count", "stimulus_duration", "interval_duration", "recall_deadline",
  "browser", "os", "viewport_width", "viewport_height",
]);

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function createNonwordPool() {
  const pool = [];
  for (let first = 0; first < KANA.length; first += 1) {
    for (let second = 0; second < KANA.length; second += 1) {
      if (first !== second) pool.push(`${KANA[first]}${KANA[second]}`);
    }
  }
  return pool;
}

export function buildSerialLists({ listLength, listCount, random = Math.random }) {
  const needed = listLength * listCount;
  const selected = shuffle(createNonwordPool(), random).slice(0, needed);
  return Array.from({ length: listCount }, (_, listIndex) => ({
    listIndex: listIndex + 1,
    items: selected.slice(listIndex * listLength, (listIndex + 1) * listLength).map((item, index) => ({
      item,
      serialPosition: index + 1,
    })),
  }));
}

export function parseRecall(text) {
  const normalized = String(text || "").normalize("NFKC").toUpperCase();
  const tokens = normalized.split(/[\s,、，。;；・/／]+/u).map((token) => token.trim()).filter(Boolean);
  return [...new Set(tokens)];
}

export function scoreRecall(list, responseText) {
  const tokens = parseRecall(responseText);
  return list.items.map((entry) => {
    const recallIndex = tokens.indexOf(entry.item);
    return {
      listIndex: list.listIndex,
      serialPosition: entry.serialPosition,
      item: entry.item,
      recalled: recallIndex >= 0 ? 1 : 0,
      recallOrder: recallIndex >= 0 ? recallIndex + 1 : null,
      responseCount: tokens.length,
    };
  });
}

export function summarizeSerialPosition(rows) {
  const positions = [...new Set(rows.map((row) => Number(row.serial_position)))].sort((a, b) => a - b);
  const curve = positions.map((position) => {
    const selected = rows.filter((row) => Number(row.serial_position) === position);
    const recalled = selected.reduce((sum, row) => sum + Number(row.recalled), 0);
    return { position, count: selected.length, recalled, recallRate: selected.length === 0 ? null : recalled / selected.length };
  });
  const third = Math.max(1, Math.floor(positions.length / 3));
  const zones = [
    { zone: "primacy", positions: positions.slice(0, third) },
    { zone: "middle", positions: positions.slice(third, positions.length - third) },
    { zone: "recency", positions: positions.slice(positions.length - third) },
  ].map((zone) => {
    const selected = rows.filter((row) => zone.positions.includes(Number(row.serial_position)));
    return { ...zone, recallRate: selected.length === 0 ? null : selected.reduce((sum, row) => sum + Number(row.recalled), 0) / selected.length };
  });
  return { curve, zones };
}

function quoteCsv(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function createSerialCsv(rows) {
  const header = SERIAL_CSV_COLUMNS.map(quoteCsv).join(",");
  const body = rows.map((row) => SERIAL_CSV_COLUMNS.map((column) => quoteCsv(row[column])).join(","));
  return `\ufeff${[header, ...body].join("\r\n")}\r\n`;
}

export function createSessionId(random = Math.random) {
  return `${Date.now().toString(36)}-${Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0")}`;
}
