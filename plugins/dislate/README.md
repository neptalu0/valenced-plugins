# Dislate EX for Valenced

> [!NOTE]
> ### Rightful Credits
> - **[acquitelol](https://github.com/acquitelol/dislate)** — Original author of the Dislate plugin for Enmity.
> - **[Rico040](https://github.com/Rico040)** — Ported and maintained Dislate for Bunny / Vendetta.
> - **[sapphire](https://discord.com/users/757982547861962752)** — Upstream contributions.

A port and enhanced modernization of the **Dislate** in-app message translation plugin for the **[Valenced](https://github.com/Valenced/valenced)** ([valenced.app](https://valenced.app)) Discord mobile client mod.

---

## ⚡ Translation Engines

1. **Google Translate** (`gtx` endpoint — free, fast, no credentials needed).
2. **Lingva Translate** (open-source, privacy-preserving frontend).
3. **AI Translation (OpenAI-Compatible `/v1` Endpoint Only)**:
   - Connects to any standard **OpenAI-compatible `/v1` API** (e.g. OpenAI, OpenRouter, LocalAI, Ollama with OpenAI endpoint, vLLM, or custom relay proxies).
   - **Supported Endpoints:**
     - `POST {endpoint}/chat/completions` — performs the context-aware translation.
     - `GET {endpoint}/models` — live model fetching with dropdown selector directly in the plugin settings.
   - **Strict Discord Markdown Preservation:**
     - Protects bold (`**`), italics (`*`), underlines (`__`), strikethroughs (`~~`), spoilers (`||`), blockquotes (`>`), subtext (`-#`), headers (`#`), code blocks (`` `inline` `` and ` ```multiline``` `), and URLs.
     - Pre-masks custom emojis `<a:name:id>`, user/role mentions `<@id>`, `<@&id>`, channel links `<#id>`, timestamps `<t:ts:f>`, and suppressed/raw URLs `<http...>` so the LLM cannot hallucinate or break them.
   - **Safe Credentials:** By default, no API keys or personal endpoints are bundled. You configure your own endpoint and API key in the settings panel.

---

## ✨ Features

- **In-App Message Translation:** Long-press any message → tap **"Translate Message"**.
- **Instant Revert:** Long-press a translated message → tap **"Revert Message"** to restore original content.
- **In-Place UI Updates:** Dispatches seamlessly via Discord's internal Flux Dispatcher without reloading the chat.
- **Interactive Settings UI:**
  - Switch engines (Google, Lingva, AI).
  - Select target & source languages (100+ languages supported).
  - Toggle original text display & immersive mode.
  - "Fetch Models" button queries your `/v1/models` endpoint live and populates a searchable dropdown.
  - Manual model override field.
- **Native Persistent Storage:** Settings are saved locally via `valenced.modules.native.fs` (`dislate_settings.json`).

---

## 📦 Installation (Valenced ZIP)

1. Download or build the plugin ZIP archive:
   - `app.valenced.dislate@1.3.0.zip`
2. Open **Discord** with **Valenced** installed.
3. Go to **User Settings** → **Valenced** → **Plugins**.
4. Tap **Import / Install from ZIP** and select `app.valenced.dislate@1.3.0.zip`.
5. Enable the plugin.

---

## 🛠️ Configuration

Open the plugin settings inside Valenced:

| Setting | Default | Description |
|---|---|---|
| `engine` | `google` | `google`, `lingva`, or `ai` |
| `targetLanguage` | `en` | Target language ISO code (e.g., `en`, `ja`, `es`, `zh`) |
| `sourceLanguage` | `auto` | Source language (`auto` for auto-detect) |
| `showOriginal` | `true` | Include original text in output |
| `immersive` | `false` | Show translation directly beneath original message |
| `aiEndpoint` | *Empty* | OpenAI-compatible base URL (e.g., `https://api.openai.com/v1`) |
| `aiApiKey` | *Empty* | API Key (e.g., `sk-...`) |
| `aiModel` | *Empty* | Model ID (e.g., `gpt-4o-mini`, or fetched from `/v1/models`) |

---

## 💻 Building from Source

```sh
# Package the plugin into an installable ZIP:
node package-zip.js
```
The output file is generated at `build/dist/app.valenced.dislate@1.3.0.zip`.

---

## 📂 Repository Structure

```
plugins/dislate/
├── manifest.json       # Valenced plugin manifest (id: app.valenced.dislate)
├── index.js            # Standalone distribution bundle (IIFE evaluated by Valenced loader)
├── README.md           # Documentation & credits
└── js/
    ├── index.ts        # Plugin lifecycle (start/stop), Flux dispatch
    ├── actionsheet.ts  # Patches LongPressMessageActionSheet
    ├── translator.ts   # Google, Lingva, and OpenAI-compatible AI translation engines
    ├── languages.ts    # Supported language dictionary
    ├── storage.ts      # Native filesystem settings persistence
    └── settings.tsx    # React Native settings UI with Live Model fetcher
```
