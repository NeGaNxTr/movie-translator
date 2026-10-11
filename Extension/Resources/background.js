// Movie Translator - Safari background script.
// Translates subtitle text for the content script. Runs in Safari's extension
// background, which may fetch external URLs thanks to the host permissions in
// manifest.json. No audio mode: iOS Safari has no speech-recognition API.

const PROVIDERS = ["google", "lingva", "mymemory"];
const cache = new Map();
const CACHE_MAX = 600;

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

if (typeof chrome.runtime.onInstalled !== "undefined") {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(DEFAULTS, (stored) => {
      chrome.storage.local.set({ ...DEFAULTS, ...(stored || {}) });
    });
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") {
    sendResponse({ ok: false });
    return false;
  }
  switch (msg.type) {
    case "mt:translate":
      translateText(msg.text, msg.source, msg.target, msg.provider)
        .then((r) => sendResponse({ ok: true, ...r }))
        .catch((err) =>
          sendResponse({ ok: false, error: String((err && err.message) || err) })
        );
      return true;

    case "mt:getSettings":
      chrome.storage.local.get(DEFAULTS, (got) => sendResponse({ ...DEFAULTS, ...got }));
      return true;

    case "mt:setSettings":
      chrome.storage.local.set(msg.patch || {}, () => sendResponse({ ok: true }));
      return true;

    default:
      sendResponse({ ok: false });
      return false;
  }
});

// ------------------------------------------------------------- translation

async function translateText(text, source, target, provider) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return { translated: "", detected: source };
  if (!target) return { translated: clean, detected: source };

  const key = `${source}|${target}|${clean}`;
  if (cache.has(key)) return { ...cache.get(key) };

  const order =
    provider && provider !== "auto"
      ? [provider, ...PROVIDERS.filter((p) => p !== provider)]
      : PROVIDERS.slice();

  let lastErr = null;
  for (const name of order) {
    try {
      const result = await runProvider(name, clean, source, target);
      const out = { translated: result.translated, detected: result.detected || source };
      cacheSet(key, out);
      return out;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(lastErr && lastErr.message ? lastErr.message : "All translation providers failed");
}

function cacheSet(key, value) {
  cache.set(key, value);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

async function runProvider(name, text, source, target) {
  switch (name) {
    case "google":
      return google(text, source, target);
    case "lingva":
      return lingva(text, source, target);
    case "mymemory":
      return mymemory(text, source, target);
    default:
      throw new Error("Unknown provider: " + name);
  }
}

async function google(text, source, target) {
  const chunks = chunkText(text, 1200);
  const out = [];
  let detected = source;
  for (const chunk of chunks) {
    const params = new URLSearchParams({
      client: "gtx",
      sl: source || "auto",
      tl: target,
      dt: "t",
      q: chunk,
    });
    const res = await fetch("https://translate.googleapis.com/translate_a/single?" + params.toString());
    if (!res.ok) throw new Error("google http " + res.status);
    const data = await res.json();
    if (data && Array.isArray(data[0])) out.push(data[0].map((p) => (p && p[0] ? p[0] : "")).join(""));
    if (data && data[2]) detected = data[2];
  }
  const translated = out.join(" ").replace(/\s+/g, " ").trim();
  if (!translated) throw new Error("google returned empty translation");
  return { translated, detected };
}

async function lingva(text, source, target) {
  const src = source && source !== "auto" ? source : "auto";
  const url = `https://lingva.ml/api/v1/${encodeURIComponent(src)}/${encodeURIComponent(target)}/${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("lingva http " + res.status);
  const data = await res.json();
  const translated = (data && data.translation ? data.translation : "").trim();
  if (!translated) throw new Error("lingva returned empty translation");
  return { translated, detected: (data && data.info && data.info.detectedSource) || source };
}

async function mymemory(text, source, target) {
  const src = source && source !== "auto" ? source : "en";
  const params = new URLSearchParams({ q: text, langpair: `${src}|${target}` });
  const res = await fetch("https://api.mymemory.translated.net/get?" + params.toString());
  if (!res.ok) throw new Error("mymemory http " + res.status);
  const data = await res.json();
  const translated = data && data.responseData && data.responseData.translatedText ? data.responseData.translatedText : "";
  if (!translated || /MYMEMORY WARNING/i.test(translated)) throw new Error("mymemory limit or empty");
  return { translated: translated.trim(), detected: src };
}

function chunkText(text, max) {
  if (text.length <= max) return [text];
  const words = String(text).split(/\s+/).filter(Boolean);
  const out = [];
  let cur = "";
  for (const word of words) {
    const candidate = cur ? cur + " " + word : word;
    if (candidate.length <= max) {
      cur = candidate;
      continue;
    }
    if (cur) out.push(cur);
    let rest = word;
    while (rest.length > max) {
      out.push(rest.slice(0, max));
      rest = rest.slice(max);
    }
    cur = rest;
  }
  if (cur && cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}