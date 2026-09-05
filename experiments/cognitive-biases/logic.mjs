export const SYLLOGISM_ITEMS = Object.freeze([
  { id: "vb-1", validity: "valid", believability: "believable", target: false, premises: ["すべてのコマドリは鳥類である。", "すべての鳥類は動物である。"], conclusion: "したがって、すべてのコマドリは動物である。", correctResponse: "valid", explanation: "コマドリは鳥類に含まれ、鳥類は動物に含まれるため、結論は必ず導かれます。" },
  { id: "vb-2", validity: "valid", believability: "believable", target: false, premises: ["爬虫類であるものは恒温動物ではない。", "すべてのヘビは爬虫類である。"], conclusion: "したがって、ヘビは恒温動物ではない。", correctResponse: "valid", explanation: "ヘビが爬虫類に含まれるという前提から、結論は必ず導かれます。" },
  { id: "vu-1", validity: "valid", believability: "unbelievable", target: true, premises: ["哺乳類であるものは水中生物ではない。", "あるクジラは水中生物である。"], conclusion: "したがって、哺乳類ではないクジラが存在する。", correctResponse: "valid", explanation: "前提を真と仮定すると、水中生物であるそのクジラは哺乳類ではないため、結論は導かれます。現実の知識は使いません。" },
  { id: "vu-2", validity: "valid", believability: "unbelievable", target: true, premises: ["すべての爬虫類は恒温動物である。", "すべてのヘビは爬虫類である。"], conclusion: "したがって、すべてのヘビは恒温動物である。", correctResponse: "valid", explanation: "前提が現実と合わなくても、2つの包含関係から結論は必ず導かれます。" },
  { id: "ib-1", validity: "invalid", believability: "believable", target: true, premises: ["鳥類であるものは哺乳類ではない。", "あるコウモリは哺乳類である。"], conclusion: "したがって、すべてのコウモリは鳥類ではない。", correctResponse: "invalid", explanation: "前提から言えるのは、少なくとも1匹のコウモリが鳥類でないことだけです。すべてのコウモリには一般化できません。" },
  { id: "ib-2", validity: "invalid", believability: "believable", target: true, premises: ["すべての医師は教育を受けている。", "ある科学者は教育を受けている。"], conclusion: "したがって、医師である科学者が存在する。", correctResponse: "invalid", explanation: "同じ性質を持つ2群に重なりがあるとは限りません。結論が現実にもっともらしくても、前提からは導けません。" },
  { id: "iu-1", validity: "invalid", believability: "unbelievable", target: false, premises: ["すべての音楽家は創造的である。", "ある石は硬い。"], conclusion: "したがって、音楽家である石が存在する。", correctResponse: "invalid", explanation: "音楽家と石を結び付ける前提がないため、結論は導けません。" },
  { id: "iu-2", validity: "invalid", believability: "unbelievable", target: false, premises: ["すべての魚は水中に生息する。", "ある自転車は青い。"], conclusion: "したがって、魚である自転車が存在する。", correctResponse: "invalid", explanation: "魚と自転車を結び付ける前提がないため、結論は導けません。" },
]);

export function shuffleItems(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function buildSyllogismSequence(random = Math.random) { return shuffleItems(SYLLOGISM_ITEMS, random); }
export function chooseSyllogism(random = Math.random) { return SYLLOGISM_ITEMS[Math.floor(random() * SYLLOGISM_ITEMS.length)]; }
export function scoreSyllogism(item, response) { return response === item.correctResponse; }
export function conjunctionIsCorrect(choice) { return choice === "single"; }
export function posteriorProbability({ baseTarget, sensitivity, falsePositiveRate }) { const numerator = baseTarget * sensitivity; return numerator / (numerator + (1 - baseTarget) * falsePositiveRate); }
export function chooseAnchor(random = Math.random) { return random() < 0.5 ? { condition: "low", value: 1750 } : { condition: "high", value: 1950 }; }
export function getAnchor(condition, random = Math.random) { return condition === "random" ? chooseAnchor(random) : condition === "high" ? { condition: "high", value: 1950 } : { condition: "low", value: 1750 }; }
export function chooseFrame(random = Math.random) { return random() < 0.5 ? "gain" : "loss"; }
export function buildFrameOrder(random = Math.random) { const first = chooseFrame(random); return first === "gain" ? ["gain", "loss"] : ["loss", "gain"]; }
export function framingExpectedOutcomes() { return { optionAExpectedSaved: 200, optionBExpectedSaved: 200, optionAExpectedLost: 400, optionBExpectedLost: 400 }; }

export const WASON_SCENARIOS = Object.freeze({
  abstract: {
    id: "abstract", title: "抽象カード課題", source: "Wason (1968)", context: "各カードの片面にはアルファベット、反対面には数字があります。", rule: "片面が母音ならば、反対面は偶数である。",
    cards: [{ id: "E", label: "E", role: "P" }, { id: "K", label: "K", role: "not-P" }, { id: "4", label: "4", role: "Q" }, { id: "7", label: "7", role: "not-Q" }], correct: ["E", "7"],
    explanation: "Eは裏が奇数なら反例になり、7は裏が母音なら反例になります。4とKは、規則が述べていない向きの情報です。",
  },
  drinking: {
    id: "drinking", title: "飲酒年齢問題", source: "Griggs & Cox (1982)", context: "飲み物と年齢がカードの両面に書かれています。酒場で次の規則への違反を調べます。", rule: "ビールを飲んでいる人は、20歳以上でなければならない。",
    cards: [{ id: "beer", label: "ビール", role: "P" }, { id: "cola", label: "コーラ", role: "not-P" }, { id: "25", label: "25歳", role: "Q" }, { id: "16", label: "16歳", role: "not-Q" }], correct: ["beer", "16"],
    explanation: "ビールを飲む人の年齢と、16歳の人の飲み物を確認します。身近な規則と違反者を探す文脈が、必要な2枚を明確にします。",
  },
  cassava: {
    id: "cassava", title: "キャッサバ根問題", source: "Cosmides (1989)", context: "架空の文化で、食べ物と顔の入れ墨がカードの両面に書かれています。利益を得ながら条件を満たさない者を調べます。", rule: "キャッサバ根を食べる男性は、顔に入れ墨がなければならない。",
    cards: [{ id: "cassava", label: "キャッサバ根", role: "P" }, { id: "nuts", label: "モロの実", role: "not-P" }, { id: "tattoo", label: "入れ墨あり", role: "Q" }, { id: "no-tattoo", label: "入れ墨なし", role: "not-Q" }], correct: ["cassava", "no-tattoo"],
    explanation: "キャッサバ根という利益を得る人と、必要条件である入れ墨を持たない人を確認します。未知の内容でも、社会的交換の違反者を探す構造が手掛かりになります。",
  },
  cholera: {
    id: "cholera", title: "コレラ問題", source: "Cheng & Holyoak (1985)", context: "入国書類の片面には入国状況、反対面には最近受けた予防接種が書かれています。", rule: "入国する旅客は、コレラの予防接種を受けていなければならない。",
    cards: [{ id: "entering", label: "入国", role: "P" }, { id: "transit", label: "通過", role: "not-P" }, { id: "cholera", label: "コレラ接種あり", role: "Q" }, { id: "no-cholera", label: "コレラ接種なし", role: "not-Q" }], correct: ["entering", "no-cholera"],
    explanation: "入国者の接種記録と、未接種者が入国者でないかを確認します。根拠づけを伴う許可規則として解釈しやすい文脈です。",
  },
});

export function getWasonScenario(id, random = Math.random) {
  if (id === "random") {
    const scenarios = Object.values(WASON_SCENARIOS);
    return scenarios[Math.floor(random() * scenarios.length)];
  }
  return WASON_SCENARIOS[id] ?? WASON_SCENARIOS.abstract;
}
export function scoreWason(selected, scenarioId = "abstract") {
  const expected = [...getWasonScenario(scenarioId).correct].sort();
  const normalized = [...new Set(selected)].sort();
  return normalized.length === expected.length && normalized.every((value, index) => value === expected[index]);
}

function quoteCsv(value) { const text = value === undefined || value === null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value); return `"${text.replaceAll('"', '""')}"`; }
export function createRowsCsv(rows) {
  if (rows.length === 0) return "\ufeff";
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = rows.map((row) => columns.map((column) => quoteCsv(row[column])).join(","));
  return `\ufeff${columns.map(quoteCsv).join(",")}\r\n${lines.join("\r\n")}\r\n`;
}
export function createSingleRowCsv(row) { return createRowsCsv([row]); }
export function createSessionId(random = Math.random) { const time = Date.now().toString(36); const suffix = Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0"); return `${time}-${suffix}`; }
