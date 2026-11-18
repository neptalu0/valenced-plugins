# Valenced Plugins

Personal repository of Discord mobile client plugins for **[Valenced](https://github.com/Valenced/valenced)** ([valenced.app](https://valenced.app)).

## 📦 In-App Plugin Repository

You can add this repository directly inside the Valenced Discord mobile client to install and receive automatic updates for these plugins:

```text
https://neptalu0.github.io/valenced-plugins/index.json
```

### How to Add in Valenced:
1. Open **Discord**.
2. Go to **User Settings** → **Valenced** → **Plugins**.
3. Tap **Repositories** (or the **`[+]`** menu) → **Add Repository**.
4. Paste `https://neptalu0.github.io/valenced-plugins/index.json`.

---

## 🔌 Available Plugins

### [Dislate EX](plugins/dislate) (v1.3.0)
Modernized message translation tool with multi-engine support and smart formatting protection:
- **3 Translation Engines:** Google Translate (free default), Lingva, and OpenAI-compatible `/v1` AI models.
- **Strict Discord Markdown Preservation:** Preserves all bold, italic, code blocks, links, custom emojis `<:name:id>`, and mentions.
- **Dynamic Model Picker:** Live query to `/v1/models` to select models directly in settings.
- **Interactive UI:** Translate or revert messages via long-press ActionSheet.

---

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/neptalu0/valenced-plugins.git
cd valenced-plugins

# Build plugins and repository index
node scripts/build-repo.js
```
The output is written to `build/pages/`.
