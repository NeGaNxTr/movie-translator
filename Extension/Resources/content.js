// Movie Translator - Safari content script.
// Reads a movie's captions and draws a translated overlay on the video.
// Two sources:
//   1. HTML5 <video> text tracks (the <track> element API).
//   2. Site-rendered caption DOM (YouTube, Vimeo, JW Player, generic players).
// Settings are polled from chrome.storage so the popup and this script never
// need a direct message channel.

(() => {
  if (window.__movieTranslatorLoaded) return;
  window.__movieTranslatorLoaded = true;

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

  const CAPTION_SELECTORS = [
    ".ytp-caption-segment",
    ".ytp-caption-window-container",
    ".player-timedtext-text-container",
    ".player-timedtext",
    '[data-uia="player-subtitle"]',
    '[class*="caption"] [class*="segment"]',
    '[class*="caption-container"]',
    '[class*="timedtext"]',
    ".vjs-text-track-display",
    ".jw-text-track-display",
    ".shaka-text-container",
    ".plyr__captions",
    ".video-js .vjs-text-track-cue",
    '[class*="subtitle"]',
  ];

  let settings = { ...DEFAULTS };
  let overlay = null;
  let overlayHost = null;
  let tickTimer = null;
  let lastCaptionText = "";
  let lastCaptionAt = 0;
  let seq = 0;
  let translateTimer = null;
  let lastSettingsAt = 0;
  let contextDead = false;
  const cache = new Map();
  const hookedTracks = new WeakSet();
  let observer = null;
  let toastTimer = null;

  // All chrome.* calls go through callBack() so the script dies cleanly if the
  // extension is reloaded while a page is still open.
  function callBack(message) {
    if (contextDead) return Promise.resolve(null);
    try {
      return Promise.resolve(chrome.runtime.sendMessage(message)).catch(() => {
        contextDead = true;
        return null;
      });
    } catch {
      contextDead = true;
      return Promise.resolve(null);
    }
  }

  function onContextDead() {
    if (contextDead) return;
    contextDead = true;
    stop();
  }

  // ---------------------------------------------------------------- lifecycle

  async function refreshSettings() {
    const res = await callBack({ type: "mt:getSettings" });
    if (!res) return;
    const next = { ...DEFAULTS, ...res };
    const changed = next.enabled !== settings.enabled;
    settings = next;
    applySettings();
    if (changed || !startedReflectsSettings()) {
      restart();
    }
  }

  let wasRunning = false;
  function startedReflectsSettings() {
    return wasRunning === settings.enabled;
  }

  function start() {
    if (wasRunning) return;
    wasRunning = true;
    document.documentElement.classList.add("mt-active");
    applyHideOriginal();
    startObserver();
    startTick();
  }

  function stop() {
    if (!wasRunning) return;
    wasRunning = false;
    document.documentElement.classList.remove("mt-active");
    stopObserver();
    stopTick();
    unhookTracks();
    if (overlay) overlay.classList.remove("mt-visible");
    lastCaptionText = "";
  }

  function restart() {
    stop();
    if (settings.enabled) start();
  }

  function applySettings() {
    document.documentElement.classList.toggle("mt-hide-original", settings.enabled && settings.hideOriginal);
    if (overlay) {
      overlay.style.setProperty("--mt-font", settings.fontSize + "px");
      overlay.style.setProperty("--mt-bg", "rgba(0,0,0," + settings.bgOpacity + ")");
    }
  }

  // -------------------------------------------------------------------- video

  function pickVideo() {
    const videos = Array.from(document.querySelectorAll("video"));
    let best = null;
    let bestArea = 0;
    for (const v of videos) {
      if (!v.isConnected) continue;
      const r = v.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea && area > 8000) {
        bestArea = area;
        best = v;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ overlay

  function ensureOverlay() {
    if (overlay && overlay.isConnected) return overlay;
    overlay = document.createElement("div");
    overlay.id = "mt-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = '<div class="mt-stack"><div class="mt-orig"></div><div class="mt-trans"></div></div>';
    document.body.appendChild(overlay);
    applySettings();
    return overlay;
  }

  function positionOverlay(video) {
    if (!overlay) return;
    const fullscreen = document.fullscreenElement;
    const host = fullscreen && fullscreen.contains(video) ? fullscreen : document.body;
    if (overlayHost !== host) {
      host.appendChild(overlay);
      overlayHost = host;
    }
    const r = video.getBoundingClientRect();
    overlay.style.left = r.left + "px";
    overlay.style.top = r.top + "px";
    overlay.style.width = r.width + "px";
    overlay.style.height = r.height + "px";
  }

  function render(orig, trans) {
    if (!settings.enabled || contextDead) return;
    ensureOverlay();
    const origEl = overlay.querySelector(".mt-orig");
    const transEl = overlay.querySelector(".mt-trans");
    transEl.textContent = trans || "";
    origEl.textContent = settings.showOriginal && trans ? orig : "";
    const visible = !!(trans || (settings.showOriginal && orig));
    overlay.classList.toggle("mt-visible", visible);
  }

  function clearCaption() {
    if (overlay) overlay.classList.remove("mt-visible");
  }

  // -------------------------------------------------- caption -> translation

  function normalize(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function handleCaption(raw) {
    const text = normalize(raw);
    if (!text) return;
    lastCaptionAt = Date.now();
    if (text === lastCaptionText) return;
    lastCaptionText = text;

    const my = ++seq;
    if (cache.has(text)) {
      render(text, cache.get(text));
      return;
    }
    render(text, "");

    clearTimeout(translateTimer);
    translateTimer = setTimeout(() => translateLatest(text, my), 150);
  }

  async function translateLatest(text, my) {
    const res = await callBack({
      type: "mt:translate",
      text,
      source: settings.source,
      target: settings.target,
      provider: settings.provider,
    });
    if (contextDead || !settings.enabled) return;
    if (res && res.ok && res.translated) {
      cacheSet(text, res.translated);
      if (my === seq || lastCaptionText === text) render(text, res.translated);
    }
  }

  function cacheSet(key, value) {
    cache.set(key, value);
    if (cache.size > 400) cache.delete(cache.keys().next().value);
  }

  // ---------------------------------------------------- source 1: text tracks

  function hookTracks() {
    const video = pickVideo();
    if (!video) return;
    const tracks = video.textTracks || [];
    for (const tt of tracks) {
      if (!tt || hookedTracks.has(tt)) continue;
      if (tt.kind !== "subtitles" && tt.kind !== "captions") continue;
      hookedTracks.add(tt);
      try {
        tt.mode = "hidden";
      } catch {
        /* some players lock mode */
      }
      const onChange = () => {
        const cues = tt.activeCues;
        if (!cues || !cues.length) return;
        const text = Array.from(cues)
          .map((c) => (c.text || "").replace(/<[^>]+>/g, " "))
          .join(" ");
        if (normalize(text)) handleCaption(text);
      };
      tt.addEventListener("cuechange", onChange);
    }
  }

  function unhookTracks() {
    const video = pickVideo();
    if (!video) return;
    for (const tt of video.textTracks || []) {
      try {
        if (tt.mode === "hidden") tt.mode = "disabled";
      } catch {
        /* ignore */
      }
    }
  }

  // ----------------------------------------------- source 2: site caption DOM

  let lastDomRead = 0;

  function readDomCaptions() {
    const weAreHiding = document.documentElement.classList.contains("mt-hide-original");
    const found = [];
    for (const selector of CAPTION_SELECTORS) {
      let els;
      try {
        els = document.querySelectorAll(selector);
      } catch {
        continue;
      }
      for (const el of els) {
        if (el.closest("#mt-overlay")) continue;
        const style = getComputedStyle(el);
        const hidden = style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0;
        if (hidden && !weAreHiding) continue;
        const t = normalize(el.textContent);
        if (t && t.length < 500) found.push(t);
      }
    }
    if (!found.length) return "";
    const uniq = Array.from(new Set(found));
    const filtered = uniq.filter((s) => !uniq.some((o) => o !== s && o.includes(s)));
    return normalize(filtered.join(" "));
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(() => {
      if (contextDead) return;
      if (!settings.enabled) return;
      if (Date.now() - lastDomRead < 150) return;
      lastDomRead = Date.now();
      const text = readDomCaptions();
      if (text) handleCaption(text);
      else if (Date.now() - lastCaptionAt > 400) clearCaption();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // --------------------------------------------------------------------- tick

  function startTick() {
    if (tickTimer) return;
    tickTimer = setInterval(tick, 400);
    tick();
  }

  function stopTick() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function tick() {
    if (contextDead) {
      stop();
      return;
    }
    // Pick up popup changes from storage (Safari often has no direct
    // content<->popup message bus, so polling is the reliable route).
    if (Date.now() - lastSettingsAt > 1500) {
      lastSettingsAt = Date.now();
      refreshSettings();
    }
    if (!settings.enabled || !wasRunning) return;

    const video = pickVideo();
    if (video) {
      ensureOverlay();
      positionOverlay(video);
      hookTracks();
      if (Date.now() - lastCaptionAt > 1200) overlay && overlay.classList.remove("mt-visible");
    }
  }

  // -------------------------------------------------------------------- toast

  function toast(message) {
    let el = document.getElementById("mt-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "mt-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("mt-toast-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("mt-toast-visible"), 4500);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== "string") return undefined;
    if (msg.type === "mt:togglePage") {
      settings.enabled = !settings.enabled;
      chrome.storage.local.set({ enabled: settings.enabled });
      restart();
      toast(settings.enabled ? "Movie Translator on" : "Movie Translator off");
      sendResponse({ ok: true, enabled: settings.enabled });
      return true;
    }
    return undefined;
  });

  init();
  function init() {
    refreshSettings();
  }
})();