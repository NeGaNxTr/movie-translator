# Movie Translator — iPhone (iOS) version

A Safari **web extension** for iPhone (and iPad) that translates any movie's
subtitles into any language — free, no API keys. This is the iOS twin of the
Brave/Chrome extension.

> **No Mac required.** You build the `.ipa` on GitHub's free macOS cloud
> runners and sideload it on your iPhone with Sideloadly or AltStore.

---

## What's in this folder

| Path | What it is |
|---|---|
| `App/` | The tiny native shell app (SwiftUI) — no logic, just an install/help screen |
| `App/Assets.xcassets/` | App icons |
| `Extension/` | The Safari web extension (manifest + JS + native handler) |
| `Extension/Resources/` | `manifest.json`, `background.js`, `content.js`, `content.css`, popup — the actual translator |
| `project.yml` | XcodeGen project definition (generates the `.xcodeproj` on a Mac) |
| `.github/workflows/build-ipa.yml` | GitHub Actions: builds the `.ipa` in the cloud |

### How it works on iOS
- The content script reads the site's subtitles (`<video>` text tracks or site
  caption DOM, like YouTube/JW Player/Vimeo) and asks the background script to
  translate them (Google free endpoint → Lingva → MyMemory, with caching).
- A translated overlay is drawn above the video.
- **No live-audio mode on iOS**: iPhone Safari has no speech-recognition API.
  Turn the site's own subtitles on and they're translated in place.

---

## Build the .ipa in the cloud (Windows, no Mac)

1. **Create a public GitHub repository** for this folder (any name). Upload its
   contents (GitHub's web UI → "uploading an existing file" works from Windows).
2. In the repo, open **Actions** → left sidebar **"Build IPA"** → **Run
   workflow** (branch `main`) → green **Run workflow**.
3. Wait ~5–8 minutes (it installs XcodeGen and compiles on a `macos-15`
   runner). When done, click the finished run → **Artifacts** →
   download **`MovieTranslator-unsigned-ipa`**.
4. Unzip it — you now have **`MovieTranslator.ipa`**.

> The build is intentionally **unsigned** (`CODE_SIGNING_ALLOWED=NO`) because
> the next step re-signs it with *your* Apple ID. This is the standard free
> sideload path.

---

## Install on your iPhone (Windows)

You need one of these two free tools. **Sideloadly** is the simpler one-off
choice; **AltStore** auto-re-signs after 7 days (much less annoying).

### Option 1 — Sideloadly (recommended for a first test)
1. Download **Sideloadly** (iOS app signer) for Windows and install iTunes +
   iCloud from the Apple website (only for iPhone drivers; do NOT use the
   Microsoft Store versions).
2. Plug your iPhone in, trust the computer, unlock the screen.
3. Open Sideloadly, drag **`MovieTranslator.ipa`** in, enter your **Apple ID**
   (or an app-specific password if you use 2FA — Apple ID → Sign-In &
   Security → App-Specific Passwords).
4. Click **Start**. On the iPhone: Settings → General → **VPN & Device
   Management** → trust your Apple ID profile. The app appears on the home
   screen.

### Option 2 — AltStore (auto re-signs every 7 days)
1. Install **AltServer** on Windows (with iTunes/iCloud as above), run it
   (tray icon), connect the iPhone.
2. Install **AltStore** on the iPhone via AltServer (`Install AltStore…`).
3. In AltStore → **My Apps** → **+** → pick `MovieTranslator.ipa`.
4. With **AltServer running**, AltStore re-signs your apps in the background
   when the 7-day certificate is about to expire — you just need to tap
   "Refresh All" each week.

> Free Apple IDs: signatures expire after **7 days** (re-sign with AltStore or
> reinstall via Sideloadly). You can have at most **3** free-signed apps.
> Consider creating a spare Apple ID for sideloading so your main account is
> never locked or blamed for the 3-app limit.

---

## Turn the extension on in Safari

1. Open iPhone **Settings** → **Safari** → **Extensions**.
2. Toggle **Movie Translator** on and set it to **Allow on All Websites**.
3. Open your movie in Safari, turn the *site's own* subtitles on, then
   **reload** the page.
4. Tap Safari's toolbar button (`Aa` menu → **Movie Translator**) — the popup
   lets you pick the output language and enable translation for the page.

If nothing happens: make sure the site subtitles are ON, `Allow on All
Websites` is set, and reload the page after changing the language.

---

## Building locally on a Mac (optional)

If you ever get a Mac, the same folder works directly:

```bash
brew install xcodegen
xcodegen generate        # creates MovieTranslator.xcodeproj
open MovieTranslator.xcodeproj
```

Set your team in Signing & Capabilities (✓ Automatically manage signing), pick
your iPhone, and Cmd-R. The extension shows up in `Settings → Safari →
Extensions` after the app installs.

---

## Before you publish/share the repo

Edit `project.yml` and pick **unique bundle IDs** (replace
`com.yourname.movietranslator`):

```yaml
PRODUCT_BUNDLE_IDENTIFIER: com.yourname.movietranslator          # e.g. com.alex.movietranslator
PRODUCT_BUNDLE_IDENTIFIER: com.yourname.movietranslator.extension
```

Two different apps can't claim the same bundle ID, and sideload tools will
reject duplicates.

---

## Translation engines (free)

Google's free endpoint (`translate.googleapis.com/translate_a/single`) →
**Lingva** (`lingva.ml`) → **MyMemory** (free tier), tried in order with an
in-memory cache. No key, no account, no cost. If a provider is down the next
one is used automatically; pick a specific engine in the popup if you want.