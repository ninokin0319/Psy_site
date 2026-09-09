function experimentVersion() {
  const script = [...document.scripts].find((item) => /(?:experiment\.js|task\.mjs)(?:\?|$)/.test(item.src));
  if (!script) return null;
  return new URL(script.src).searchParams.get("v");
}

function showVersion() {
  const version = experimentVersion();
  const metadata = document.querySelector(".lesson-meta, .experiment-meta");
  if (!version || !metadata || metadata.querySelector("[data-version-label]")) return;
  const item = document.createElement("div");
  item.dataset.versionLabel = "";
  item.innerHTML = `<dt>教材版</dt><dd>v${version}</dd>`;
  metadata.append(item);
}

function controlsByName(form) {
  return [...form.elements].filter((control) => control.name && !control.disabled);
}

function applySharedSettings(form) {
  const params = new URL(window.location.href).searchParams;
  const names = [...new Set(controlsByName(form).map((control) => control.name))];
  for (const name of names) {
    const values = params.getAll(`cfg_${name}`);
    if (values.length === 0) continue;
    const controls = controlsByName(form).filter((control) => control.name === name);
    if (controls[0]?.type === "radio") {
      const selected = controls.find((control) => control.value === values[0]);
      if (selected) {
        selected.checked = true;
        selected.dispatchEvent(new Event("change", { bubbles: true }));
      }
      continue;
    }
    if (controls[0]?.type === "checkbox") {
      controls.forEach((control) => { control.checked = values.includes(control.value); });
      controls[0]?.dispatchEvent(new Event("change", { bubbles: true }));
      continue;
    }
    controls[0].value = values[0];
    controls[0].dispatchEvent(new Event("input", { bubbles: true }));
    controls[0].dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function settingsUrl(form) {
  const url = new URL(window.location.href);
  url.hash = "setup";
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("cfg_")) url.searchParams.delete(key);
  }
  const grouped = new Map();
  for (const control of controlsByName(form)) {
    if ((control.type === "radio" || control.type === "checkbox") && !control.checked) continue;
    if (!grouped.has(control.name)) grouped.set(control.name, []);
    grouped.get(control.name).push(control.value);
  }
  for (const [name, values] of grouped) {
    for (const value of values) url.searchParams.append(`cfg_${name}`, value);
  }
  return url.href;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.className = "share-url-fallback";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function wireShareSettings() {
  const form = document.querySelector("#config-form");
  if (!form) return;
  applySharedSettings(form);
  const host = form.querySelector(".config-actions") || form;
  const wrap = document.createElement("div");
  wrap.className = "share-settings";
  wrap.innerHTML = '<button type="button" class="button quiet" data-share-settings>この設定のURLをコピー</button><span role="status" aria-live="polite"></span>';
  host.append(wrap);
  wrap.querySelector("button").addEventListener("click", async () => {
    const status = wrap.querySelector("[role='status']");
    try {
      await copyText(settingsUrl(form));
      status.textContent = "設定URLをコピーしました。";
    } catch {
      status.textContent = "次の欄のURLを選択してコピーしてください。";
      let fallback = wrap.querySelector('input');
      if (!fallback) {
        fallback = document.createElement('input');
        fallback.readOnly = true;
        fallback.setAttribute('aria-label', '共有する設定URL');
        wrap.append(fallback);
      }
      fallback.value = settingsUrl(form);
      fallback.focus();
      fallback.select();
    }
  });
}

function wireDebriefGuard() {
  const panel = document.querySelector("details[data-debrief], details.explanation-panel");
  if (!panel) return;
  const results = document.querySelector("#results");
  const showBefore = new URL(window.location.href).searchParams.get("explain") === "before";
  const gate = document.createElement("aside");
  gate.id = "theory-gate";
  gate.className = "debrief-gate";
  gate.innerHTML = '<div><p class="eyebrow">DEBRIEF</p><h2>詳しい解説は体験後に表示します</h2><p>仮説や解法を先に読むと、回答や方略が変わることがあります。授業計画上必要な場合だけ、先に開いてください。</p></div><button type="button" class="button quiet">解説を先に読む</button>';
  panel.before(gate);

  const reveal = ({ open = false } = {}) => {
    panel.hidden = false;
    gate.hidden = true;
    if (open) {
      panel.open = true;
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (showBefore) reveal();
  else panel.hidden = true;
  gate.querySelector("button").addEventListener("click", () => reveal({ open: true }));

  for (const link of document.querySelectorAll('a[href="#theory"]')) {
    if (!showBefore) {
      link.href = "#theory-gate";
      link.textContent = link.closest('nav') ? '解説' : '解説について';
    }
  }

  if (!results) return;
  const observer = new MutationObserver(() => {
    if (!results.hidden) {
      reveal();
      observer.disconnect();
    }
  });
  observer.observe(results, { attributes: true, attributeFilter: ["hidden"] });
}

showVersion();
wireShareSettings();
wireDebriefGuard();
