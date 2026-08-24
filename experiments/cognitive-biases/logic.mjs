export const SYLLOGISM_ITEMS = Object.freeze([
  { id: "valid-unbelievable", validity: "valid", believability: "unbelievable", premises: ["哺乳類であるものは水中生物ではない。", "あるクジラは水中生物である。"], conclusion: "したがって、哺乳類ではないクジラが存在する。", correctResponse: "valid" },
  { id: "invalid-believable", validity: "invalid", believability: "believable", premises: ["鳥類であるものは哺乳類ではない。", "あるコウモリは哺乳類である。"], conclusion: "したがって、コウモリはすべて鳥類ではない。", correctResponse: "invalid" },
]);

export function chooseSyllogism(random = Math.random) { return SYLLOGISM_ITEMS[random() < 0.5 ? 0 : 1]; }
export function scoreSyllogism(item, response) { return response === item.correctResponse; }
export function conjunctionIsCorrect(choice) { return choice === "single"; }
export function posteriorProbability({ baseTarget, sensitivity, falsePositiveRate }) { const numerator = baseTarget * sensitivity; return numerator / (numerator + (1 - baseTarget) * falsePositiveRate); }
export function chooseAnchor(random = Math.random) { return random() < 0.5 ? { condition: "low", value: 1750 } : { condition: "high", value: 1950 }; }
export function chooseFrame(random = Math.random) { return random() < 0.5 ? "gain" : "loss"; }
export function framingExpectedOutcomes() { return { optionAExpectedSaved: 200, optionBExpectedSaved: 200, optionAExpectedLost: 400, optionBExpectedLost: 400 }; }
export function scoreWason(selected) { const normalized = [...new Set(selected)].sort(); return normalized.length === 2 && normalized[0] === "7" && normalized[1] === "E"; }

function quoteCsv(value) { const text = value === undefined || value === null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value); return `"${text.replaceAll('"', '""')}"`; }
export function createSingleRowCsv(row) { const columns = Object.keys(row); return `\ufeff${columns.map(quoteCsv).join(",")}\r\n${columns.map((column) => quoteCsv(row[column])).join(",")}\r\n`; }
export function createSessionId(random = Math.random) { const time = Date.now().toString(36); const suffix = Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0"); return `${time}-${suffix}`; }
