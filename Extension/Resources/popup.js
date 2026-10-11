// Movie Translator - Safari popup. Reads/writes chrome.storage.local directly;
// the content script picks up changes by polling storage.

const LANGUAGES = [
  ["auto", "Auto (detect)"],
  ["en", "English"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["ru", "Russian"],
  ["ar", "Arabic"],
  ["hi", "Hindi"],
  ["bn", "Bengali"],
  ["ur", "Urdu"],
  ["tr", "Turkish"],
  ["nl", "Dutch"],
  ["pl", "Polish"],
  ["sv", "Swedish"],
  ["no", "Norwegian"],
  ["da", "Danish"],
  ["fi", "Finnish"],
  ["cs", "Czech"],
  ["el", "Greek"],
  ["he", "Hebrew"],
  ["th", "Thai"],
  ["vi", "Vietnamese"],
  ["id", "Indonesian"],
  ["ms", "Malay"],
  ["fa", "Persian"],
  ["uk", "Ukrainian"],
  ["ro", "Romanian"],
  ["hu", "Hungarian"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["zh-CN", "Chinese (Simplified)"],
  ["zh-TW", "Chinese (Traditional)"],
  ["tl", "Tagalog"],
];

const DEFAULTS = {
  enabled: false,
  source: "auto",
  target: "en",
  provider: "auto",
  hideOriginal: true,
  showOriginal: false,
  fontSize: 24,
  bgOpacity: 0.6,
};

const $ = (id) => document.getElementById(id);

function load(cb) {
  chrome.storage.local.get(DEFAULTS, (got) => cb({ ...DEFAULTS, ...(got || {}) }));
}

function save(patch) {
  chrome.storage.local.set(patch || {});
}

function fillSelect(sel, list, value) {
  sel.innerHTML = "";
  for (const [code, name] of list) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = name;
    if (code === value) opt.selected = true;
    sel.appendChild(opt);
  }
}

function init() {
  load((s) => {
    fillSelect($("target"), LANGUAGES.slice(1), s.target);
    fillSelect($("source"), LANGUAGES, s.source);

    $("enabled").checked = s.enabled;
    $("provider").value = s.provider;
    $("hideOriginal").checked = s.hideOriginal;
    $("showOriginal").checked = s.showOriginal;
    $("fontSize").value = s.fontSize;
    $("bgOpacity").value = s.bgOpacity;
    $("fontSizeLabel").textContent = s.fontSize + "px";
    $("bgOpacityLabel").textContent = Math.round(s.bgOpacity * 100) + "%";
  });

  $("enabled").addEventListener("change", (e) => save({ enabled: e.target.checked }));
  $("target").addEventListener("change", (e) => save({ target: e.target.value }));
  $("source").addEventListener("change", (e) => save({ source: e.target.value }));
  $("provider").addEventListener("change", (e) => save({ provider: e.target.value }));
  $("hideOriginal").addEventListener("change", (e) => save({ hideOriginal: e.target.checked }));
  $("showOriginal").addEventListener("change", (e) => save({ showOriginal: e.target.checked }));

  $("fontSize").addEventListener("input", (e) => {
    $("fontSizeLabel").textContent = e.target.value + "px";
    save({ fontSize: Number(e.target.value) });
  });

  $("bgOpacity").addEventListener("input", (e) => {
    $("bgOpacityLabel").textContent = e.target.value + "%";
    save({ bgOpacity: Number(e.target.value) / 100 });
  });
}

document.addEventListener("DOMContentLoaded", init);