export const NINE_DOT_CSV_COLUMNS = Object.freeze([
  "experiment_id", "experiment_version", "session_id", "recorded_at", "attempt_index",
  "segment_count", "covered_dots", "success", "timed_out", "path_json", "attempt_rt",
  "total_rt", "insight_rating", "max_attempts", "time_limit", "prior_familiarity", "browser", "os",
  "viewport_width", "viewport_height",
]);

export function createNineDots(originX = 220, originY = 130, spacing = 100) {
  return Array.from({ length: 3 }, (_, row) => Array.from({ length: 3 }, (_, column) => ({
    x: originX + column * spacing,
    y: originY + row * spacing,
  }))).flat();
}

export function distancePointToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const projection = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + projection * dx), point.y - (start.y + projection * dy));
}

export function evaluateNineDotPath(path, dots = createNineDots(), tolerance = 13) {
  const segments = path.slice(1).map((point, index) => ({ start: path[index], end: point }));
  const covered = dots.map((dot) => segments.some((segment) => distancePointToSegment(dot, segment.start, segment.end) <= tolerance));
  return {
    segmentCount: segments.length,
    coveredDots: covered.filter(Boolean).length,
    covered,
    success: segments.length === 4 && covered.every(Boolean),
  };
}

export function canonicalSolutionPath() {
  return [
    { x: 220, y: 130 },
    { x: 520, y: 130 },
    { x: 220, y: 430 },
    { x: 220, y: 130 },
    { x: 520, y: 430 },
  ];
}

function quoteCsv(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function createNineDotCsv(rows) {
  const header = NINE_DOT_CSV_COLUMNS.map(quoteCsv).join(",");
  const body = rows.map((row) => NINE_DOT_CSV_COLUMNS.map((column) => quoteCsv(row[column])).join(","));
  return `\ufeff${[header, ...body].join("\r\n")}\r\n`;
}

export function createSessionId(random = Math.random) {
  return `${Date.now().toString(36)}-${Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0")}`;
}
