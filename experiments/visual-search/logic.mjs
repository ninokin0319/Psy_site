export const SEARCH_CSV_COLUMNS = Object.freeze([
  "experiment_id", "experiment_version", "session_id", "random_seed", "recorded_at", "trial_index",
  "search_type", "set_size", "target_present", "correct_response", "response_key",
  "correctness", "rt", "timed_out", "repetitions", "response_deadline", "iti", "focus_loss_count",
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

export function buildSearchTrials({ searchTypes, setSizes, repetitions, random = Math.random }) {
  const trials = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (const searchType of searchTypes) {
      for (const setSize of setSizes) {
        for (const targetPresent of [true, false]) {
          trials.push({ searchType, setSize, targetPresent, repetition });
        }
      }
    }
  }
  return shuffle(trials, random).map((trial, index) => ({ ...trial, trialIndex: index + 1 }));
}

export function buildStimulusItems({ searchType, setSize, targetPresent }, random = Math.random) {
  const positions = shuffle(Array.from({ length: 36 }, (_, index) => index), random).slice(0, setSize);
  const distractors = searchType === "feature"
    ? [{ color: "green", orientation: "descending" }]
    : [
        { color: "red", orientation: "ascending" },
        { color: "green", orientation: "descending" },
        { color: "green", orientation: "ascending" },
      ];
  const types = [];
  if (targetPresent) types.push({ color: "red", orientation: "descending", target: true });
  while (types.length < setSize) {
    const distractor = distractors[(types.length - (targetPresent ? 1 : 0)) % distractors.length];
    types.push({ ...distractor, target: false });
  }
  const shuffledTypes = targetPresent
    ? [types[0], ...shuffle(types.slice(1), random)]
    : shuffle(types, random);
  return positions.map((position, index) => ({ position, ...shuffledTypes[index] }));
}

function mean(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function slope(points) {
  if (points.length < 2) return null;
  const xMean = mean(points.map((point) => point.x));
  const yMean = mean(points.map((point) => point.y));
  const numerator = points.reduce((sum, point) => sum + (point.x - xMean) * (point.y - yMean), 0);
  const denominator = points.reduce((sum, point) => sum + (point.x - xMean) ** 2, 0);
  return denominator === 0 ? null : numerator / denominator;
}

export function summarizeSearch(rows) {
  const searchTypes = [...new Set(rows.map((row) => row.search_type))].sort();
  const setSizes = [...new Set(rows.map((row) => Number(row.set_size)))].sort((a, b) => a - b);
  const cells = [];
  for (const searchType of searchTypes) {
    for (const targetPresent of [true, false]) {
      for (const setSize of setSizes) {
        const selected = rows.filter((row) => row.search_type === searchType
          && String(row.target_present) === String(targetPresent)
          && Number(row.set_size) === setSize);
        const correct = selected.filter((row) => Number(row.correctness) === 1);
        cells.push({
          searchType,
          targetPresent,
          setSize,
          count: selected.length,
          accuracy: selected.length === 0 ? null : correct.length / selected.length,
          meanCorrectRt: mean(correct.map((row) => Number(row.rt)).filter(Number.isFinite)),
        });
      }
    }
  }
  const slopes = [];
  for (const searchType of searchTypes) {
    for (const targetPresent of [true, false]) {
      const points = cells
        .filter((cell) => cell.searchType === searchType && cell.targetPresent === targetPresent && cell.meanCorrectRt !== null)
        .map((cell) => ({ x: cell.setSize, y: cell.meanCorrectRt }));
      slopes.push({ searchType, targetPresent, slope: slope(points) });
    }
  }
  return { searchTypes, setSizes, cells, slopes };
}

function quoteCsv(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function createSearchCsv(rows) {
  const header = SEARCH_CSV_COLUMNS.map(quoteCsv).join(",");
  const body = rows.map((row) => SEARCH_CSV_COLUMNS.map((column) => quoteCsv(row[column])).join(","));
  return `\ufeff${[header, ...body].join("\r\n")}\r\n`;
}

export function createSessionId(random = Math.random) {
  return `${Date.now().toString(36)}-${Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0")}`;
}
