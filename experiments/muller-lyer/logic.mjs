export const CSV_COLUMNS = [
  "experiment_id", "experiment_version", "session_id", "random_seed", "recorded_at",
  "trial_index", "condition_order", "wing_angle", "standard_length",
  "wing_direction", "wing_smaller_angle", "wing_length",
  "initial_comparison_length", "step_size",
  "final_comparison_length", "adjustment_count", "rt", "blur_count",
  "quality_flag", "preset", "repetitions", "browser", "browser_version",
  "os", "viewport_width", "viewport_height", "screen_width", "screen_height",
  "device_pixel_ratio", "vsync_rate",
];

export function describeWingAngle(angleDegrees) {
  const normalized = ((Number(angleDegrees) % 360) + 360) % 360;
  if (normalized === 0 || normalized === 180) {
    return { direction: "neutral", directionLabel: "中立", smallerAngle: normalized };
  }
  const inward = normalized < 180;
  return {
    direction: inward ? "inward" : "outward",
    directionLabel: inward ? "内向" : "外向",
    smallerAngle: inward ? normalized : 360 - normalized,
  };
}

export function buildWingSegments(centerX, centerY, lineLength, wingLength, angleDegrees) {
  const description = describeWingAngle(angleDegrees);
  if (description.direction === "neutral") return [];

  // 参考サイトと同じく、60°は内向、300°は外向として扱います。
  // 300°は反射角なので、2本の矢羽が作る小さい方の角はどちらも60°です。
  const halfAngle = (description.smallerAngle / 2) * (Math.PI / 180);
  const dx = wingLength * Math.cos(halfAngle);
  const dy = wingLength * Math.sin(halfAngle);
  // 参考サイトの「内向」は矢羽線が主線の中央側へ、「外向」は外側へ伸びる配置です。
  const horizontalSign = description.direction === "inward" ? 1 : -1;
  const leftX = centerX - lineLength / 2;
  const rightX = centerX + lineLength / 2;

  return [
    { from: [leftX, centerY], to: [leftX + horizontalSign * dx, centerY - dy] },
    { from: [leftX, centerY], to: [leftX + horizontalSign * dx, centerY + dy] },
    { from: [rightX, centerY], to: [rightX - horizontalSign * dx, centerY - dy] },
    { from: [rightX, centerY], to: [rightX - horizontalSign * dx, centerY + dy] },
  ];
}

export function buildConditions(config, random = Math.random) {
  const conditions = [];
  for (const wingAngle of config.angles) {
    for (const initialComparisonLength of config.initialLengths) {
      for (let repetition = 1; repetition <= config.repetitions; repetition += 1) {
        conditions.push({ wingAngle, initialComparisonLength, repetition });
      }
    }
  }
  // Fisher–Yates法：条件数は変えず、提示順だけをランダムにします。
  for (let index = conditions.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [conditions[index], conditions[swapIndex]] = [conditions[swapIndex], conditions[index]];
  }
  return conditions;
}

export function summarizeResults(rows, standardLength) {
  const groups = new Map();
  for (const row of rows) {
    const angle = Number(row.wing_angle);
    if (!groups.has(angle)) groups.set(angle, []);
    groups.get(angle).push(Number(row.final_comparison_length));
  }
  return [...groups.entries()]
    .sort(([angleA], [angleB]) => angleA - angleB)
    .map(([angle, values]) => {
      const pse = values.reduce((sum, value) => sum + value, 0) / values.length;
      return { angle, count: values.length, pse, adjustmentError: pse - standardLength };
    });
}

function escapeCsv(value) {
  const stringValue = String(value ?? "");
  return /[",\r\n]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

export function createCsv(rows) {
  const header = CSV_COLUMNS.join(",");
  const body = rows.map((row) => CSV_COLUMNS.map((column) => escapeCsv(row[column])).join(","));
  return `\uFEFF${[header, ...body].join("\r\n")}`;
}

export function createSessionId(cryptoObject = globalThis.crypto) {
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}
