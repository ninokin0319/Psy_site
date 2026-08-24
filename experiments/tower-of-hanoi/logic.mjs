export const HANOI_CSV_COLUMNS = Object.freeze([
  "experiment_id",
  "experiment_version",
  "session_id",
  "recorded_at",
  "run_index",
  "attempt_index",
  "source_peg",
  "target_peg",
  "disk",
  "legal_move",
  "error_reason",
  "elapsed_ms",
  "state_after",
  "disk_count",
  "goal_peg",
  "minimum_moves",
  "completed",
  "final_legal_moves",
  "final_illegal_attempts",
  "final_elapsed_ms",
  "restart_count",
  "preset",
  "browser",
  "os",
  "viewport_width",
  "viewport_height",
]);

export function createTowerState(diskCount) {
  return [Array.from({ length: diskCount }, (_, index) => diskCount - index), [], []];
}

export function cloneState(state) {
  return state.map((peg) => [...peg]);
}

export function minimumMoves(diskCount) {
  return 2 ** diskCount - 1;
}

export function inspectMove(state, sourcePeg, targetPeg) {
  if (![sourcePeg, targetPeg].every((peg) => Number.isInteger(peg) && peg >= 0 && peg <= 2)) {
    return { legal: false, reason: "invalid-peg", disk: null };
  }
  if (sourcePeg === targetPeg) return { legal: false, reason: "same-peg", disk: null };
  const disk = state[sourcePeg].at(-1) ?? null;
  if (disk === null) return { legal: false, reason: "empty-source", disk: null };
  const targetTop = state[targetPeg].at(-1) ?? Infinity;
  if (disk > targetTop) return { legal: false, reason: "larger-on-smaller", disk };
  return { legal: true, reason: null, disk };
}

export function applyMove(state, sourcePeg, targetPeg) {
  const inspection = inspectMove(state, sourcePeg, targetPeg);
  if (!inspection.legal) return { state: cloneState(state), ...inspection };
  const nextState = cloneState(state);
  nextState[sourcePeg].pop();
  nextState[targetPeg].push(inspection.disk);
  return { state: nextState, ...inspection };
}

export function isSolved(state, goalPeg, diskCount) {
  return state[goalPeg].length === diskCount
    && state[goalPeg].every((disk, index, disks) => index === 0 || disks[index - 1] > disk);
}

export function summarizeHanoi({ completed, diskCount, legalMoves, illegalAttempts, elapsedMs, restartCount }) {
  const optimum = minimumMoves(diskCount);
  return {
    completed,
    diskCount,
    legalMoves,
    illegalAttempts,
    elapsedMs,
    restartCount,
    minimumMoves: optimum,
    excessMoves: completed ? legalMoves - optimum : null,
    moveEfficiency: completed && legalMoves > 0 ? optimum / legalMoves : null,
  };
}

function quoteCsv(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function createHanoiCsv(rows) {
  const header = HANOI_CSV_COLUMNS.map(quoteCsv).join(",");
  const lines = rows.map((row) => HANOI_CSV_COLUMNS.map((column) => quoteCsv(row[column])).join(","));
  return `\ufeff${[header, ...lines].join("\r\n")}\r\n`;
}

export function createSessionId(random = Math.random) {
  const time = Date.now().toString(36);
  const suffix = Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0");
  return `${time}-${suffix}`;
}
