---
name: stitch
description: >
  Master guide for Google Stitch and Stitch MCP server integration.
  Requires the Stitch MCP server to be active. Use this skill when:
  (1) generating, editing, or creating variants of UI screens using Stitch,
  (2) managing Stitch design systems and DESIGN.md specifications,
  (3) orchestrating iterative multi-page website development via the build loop,
  (4) converting Stitch designs to React, Next.js, or HTML components,
  (5) creating interactive prototypes from an implementation plan (e.g. `.ai/plans/<feature>/`) — see the "Plan-to-Prototype Recipe" below.
license: MIT
compatibility: Requires Stitch MCP server configured with STITCH_API_KEY and GOOGLE_CLOUD_PROJECT
metadata:
  version: "1.0.0"
allowed-tools: Read Write Edit Glob Grep call_mcp_tool
---

# Google Stitch Master Skill

Master guide for orchestrating UI design workflows, design systems, and component generation using **Google Stitch** and the **Stitch MCP Server**.

---

## ⚠️ Requirements & Environment

This skill **requires the Stitch MCP Server** to be configured and available in your environment:

```json
{
  "stitch": {
    "command": "npx",
    "args": ["-y", "@_davideast/stitch-mcp", "proxy"],
    "env": {
      "STITCH_API_KEY": "<YOUR_STITCH_API_KEY>",
      "GOOGLE_CLOUD_PROJECT": "<YOUR_GOOGLE_CLOUD_PROJECT>"
    }
  }
}
```

When invoking Stitch tools, call them directly or via `call_mcp_tool` with `ServerName: "stitch"`.

---

## Quick Reference

| Intent | Tool / Action | Key Parameters |
|:---|:---|:---|
| **List projects** | `list_projects` | `{ filter: "view=owned" }` |
| **Create project** | `create_project` | `{ title: "Project Name" }` |
| **Get project details** | `get_project` | `{ name: "projects/<projectId>" }` |
| **Generate new screen** | `generate_screen_from_text` | `{ projectId, prompt, deviceType, modelId }` |
| **Edit existing screen** | `edit_screens` | `{ projectId, selectedScreenIds: ["<id>"], prompt }` |
| **Explore variations** | `generate_variants` | `{ projectId, selectedScreenIds: ["<id>"], variantOptions }` |
| **List screens** | `list_screens` | `{ projectId }` |
| **Get screen HTML/image** | `get_screen` | `{ projectId, screenId }` |
| **Download assets** | `download_assets` | `{ projectId, outputDir: ".stitch/designs" }` |
| **Manage design system** | `create_design_system` / `upload_design_md` | `{ projectId, designSystem }` / `{ projectId, designMdBase64 }` |
| **Apply design system** | `apply_design_system` | `{ projectId, assetId, selectedScreenInstances: [{ id, sourceScreen }] }` |

---

## Plan-to-Prototype Recipe

When asked to "create a prototype for a plan" (e.g. `.ai/plans/<feature>/specs.md` or `implementation.md`), follow this exact sequence:

1. **Read the plan** (`view`; use `view_range` for large files). Extract:
   - Every distinct **screen/page** the plan describes (lists, forms, detail views, dialogs, per-role views, mobile variants).
   - UI details worth prompting: filters, columns, status badges, autocomplete, auto-fill behavior, per-audience differences.
2. **Ground the prompt in the actual codebase — never prompt from the plan alone.** Before writing any generation prompt, inspect the real surfaces the screen will live in and mirror them:
   - **Existing components**: find the components that render the screen's core elements (e.g. list rows, cards, dialogs, nav, app bars) and copy their *structure* into the prompt (element order, what an item looks like, which states tint/bold, which actions exist).
   - **Theme**: read the project's theme/palette source and give the generator the real color roles (background, primary, secondary, success/warning/error) and typography direction — never invent a palette. If the project forbids hardcoded colors in code, still spell the real hex values out in the prompt: the generator cannot see the theme system.
   - **Copy**: pull real strings from the project's locale/i18n files (titles, labels, button text) instead of inventing placeholder copy; match the UI language and direction (RTL/LTR) per audience.
   - **Layout shell**: check whether the product is desktop-dashboard, mobile app, or hybrid, and which chrome exists (sidebar position, top bar contents) — describe that shell explicitly.
   - If the plan is backend-only, prototype the *observable surfaces* the plan's acceptance criteria reference, grounded in the components that already render those surfaces.
3. **Auth probe**: call `list_projects` first. A 401 means the token is expired — ask the user to re-authenticate before generating anything.
4. **Always create a NEW project**: `create_project` with a title like `"Kottaby — <Feature> Prototypes"`. Record the numeric `projectId`. Never reuse an existing plan-prototype project for a different plan — one project per plan keeps screens organized.
5. **Design system** (optional consistency step): call `list_design_systems` on a previous prototype project (or globally) to find a matching system; pass its `designSystem` ID (`assets/...`) to `generate_screen_from_text` for visual consistency across plan prototypes. Fall back to defaults if none fit.
6. **Generate one screen per identified page**, sequential calls with a detailed, self-contained prompt per screen (layout, sidebar, fields, states, badges, data examples from the plan, real palette + real copy per step 2). Use `GEMINI_3_1_PRO` for plan prototypes (quality matters more than speed here); drop to `GEMINI_3_FLASH` only for throwaway wireframes. Match `deviceType` to the real product surface (DESKTOP for admin/back-office dashboards, MOBILE only if the product actually has mobile surfaces).
7. **After each generation, immediately capture** the new screen's `name`/`id`/title from the response (grep the temp output file if needed — see Ground Rules). Do **not** rely on `list_screens` for fresh screens.
8. **Validate the generated content itself, not just the file**: a generation can "succeed" yet return a useless render (e.g. just a logo/wordmark, a blank hero, wrong layout). Before moving on, check the response metadata for degenerate-output signals — generic titles unrelated to the requested page (e.g. "<Brand> Wordmark"), square 1024×1024 dimensions for a DESKTOP request, or an empty `htmlCode`. Any of these means REGENERATE the screen with a clarified prompt (explicitly demand "a full page screenshot, not a logo/wordmark"); don't download and report it as a successful artifact.
9. **Save artifacts locally** under `<plan-dir>/prototype/`:
   - `mkdir -p <plan-dir>/prototype`
   - Per screen: `curl -sL -o <kebab-case-name>.png "<screenshot.downloadUrl>=s0"` (note the `=s0`).
   - **Do NOT download HTML by default.** Only fetch `.html` files (`curl -sL -o <kebab-case-name>.html "<htmlCode.downloadUrl>"`) when the user explicitly asks for HTML artifacts/code. PNG screenshots are the default deliverable.
   - Re-fetch URLs with `get_screen` for any screen not in a fresh `list_screens` result.
   - Verify: `file *.png` → PNG (a `JPEG` result for a `.png` path is a red flag — inspect dimensions; square 1024×1024 usually means the degenerate case from step 8), sizes >1KB, dimensions match the render (2560×2048 desktop). If HTML was requested, also verify `file *.html` → HTML.
10. **Report**: list saved files + the Stitch project resource name so the user can iterate via `edit_screens` / `generate_variants`.

---

## Workflow Guide

### 1. Project & Design System Setup
- Discover existing workspaces using `list_projects`.
- If starting fresh, call `create_project` and save metadata to `.stitch/metadata.json`.
- Define or upload your design system:
  - Create a dual-representation `DESIGN.md` (see [DESIGN.md Spec](references/design-md-spec.md)).
  - Upload via `upload_design_md` and activate via `create_design_system_from_design_md`, or configure tokens via `create_design_system`.

### 2. Prompt Enhancement & Screen Generation
- Transform user requirements into structured architectural prompts using professional UI/UX terms (see [Prompting & Mappings](references/prompting-and-mappings.md)).
- Call `generate_screen_from_text`:
  - **Models**: Use `GEMINI_3_1_PRO` for high fidelity / production designs, `GEMINI_3_FLASH` for fast wireframes. *(Avoid deprecated `GEMINI_3_PRO`)*.
  - **Device Types**: `DESKTOP`, `MOBILE`, `TABLET`, or `AGNOSTIC`.
  - **Timing**: Generation takes 60–180 seconds. Do not retry on timeout; verify status with `get_screen`.
  - **Capture screen IDs from the generation response** immediately. The response is large and may be saved to a temp file (e.g. `/tmp/*-copilot-tool-output-*.txt`) — parse it with `grep '"name":"projects/<pid>/screens/<id>"'` / `grep '"title":"..."'` instead of re-invoking tools. `list_screens` is **eventually consistent** — it often omits screens generated seconds earlier, may return an empty `{}` right after generation, and may fail with `exception: unmarshalling uint64` (retry once, use cached URLs). Prefer `get_screen` with the captured IDs to fetch fresh download URLs.
  - **Do NOT rely on `get_project` to enumerate screens.** Its response contains project metadata and a thumbnail but not a usable screens list; treat the generation responses + `get_screen` as the source of truth.
  - A successful generation response contains the new screen's ID even when `htmlCode`/`screenshot` URLs in it are placeholders; re-fetch via `get_screen` after ~30s if URLs are missing.

### 3. Iteration & Variants
- **Focused Edits**: Use `edit_screens` with targeted instructions ("Change primary button to deep indigo #4F46E5; keep all other elements identical").
- **Exploration**: Use `generate_variants` with `creativeRange: "EXPLORE"` or `"REIMAGINE"` across aspects (`LAYOUT`, `COLOR_SCHEME`, etc.).

### 4. Asset Download & Code Integration
- Retrieve full metadata with `get_screen`:
  - Fetch HTML code from `htmlCode.downloadUrl` (requires `curl -L` to follow redirects).
  - Fetch the **full-resolution** screenshot by appending `=s0` to `screenshot.downloadUrl`. The bare URL returns a small, blurry thumbnail (~30–80KB); `=s0` returns the original render (~110–430KB, e.g. 2560×2048 desktop). Prefer `=s0` over `=w{width}`.
- **`download_assets` is unreliable**: it can report success yet write no files at all. Always verify afterwards (`ls` the outputDir + confirm file count). If empty, fall back to downloading each screen's `htmlCode.downloadUrl` and `screenshot.downloadUrl` directly with `curl -sL`, saving with meaningful names.
- After any download, **validate files**: `file *.html *.png` must show HTML/PNG (not JSON) and sizes must be >1KB. A "successful" download of ~100–500 bytes is usually a JSON error payload, not an asset. `file` also reports PNG dimensions — 512×410 means you accidentally saved a thumbnail even when the byte size looked plausible; desktop originals are 2560×2048 and ~110–430KB.
- Convert generated markup into clean React/Next.js/Tailwind components matching your project architecture.

### 5. Multi-Page Build Loop
- For multi-page flows, follow the baton protocol in `.stitch/next-prompt.md` and `.stitch/SITE.md` (see [Build Loop Guide](references/build-loop.md)).

---

## Reference Documents

- [MCP Tools & Parameters Reference](references/mcp-tools.md) — Detailed schemas, parameter types, and ID conventions.
- [Prompting & UI Mappings Reference](references/prompting-and-mappings.md) — Professional terminology and prompt structures.
- [Build Loop & Multi-Page Protocol](references/build-loop.md) — Autonomous multi-page application workflows.
- [DESIGN.md Specification](references/design-md-spec.md) — Dual-representation design system format.

---

## Troubleshooting

### 401 "invalid authentication credentials"
The MCP server's OAuth token / `STITCH_API_KEY` is expired or invalid. Symptoms: **every** tool call fails with `Stitch API error (401)`.
- Ask the user to restart/re-authenticate the `stitch` MCP server (new API key in `.mcp.json` env, or re-run the OAuth flow), then retry. A 401 will **not** self-heal by retrying.
- Verify auth with the cheapest call first (`list_projects`) before attempting generation — failing early avoids half-created projects.

### `download_assets` reports success but directory is empty
Known flaky behavior. Do not trust the success message — always verify with `ls`. Fallback: loop over screens and `curl -sL` each `htmlCode.downloadUrl` and `screenshot.downloadUrl` (get fresh URLs from `get_screen`; URLs are signed and expire).

### Low-quality / blurry screenshots
The bare `screenshot.downloadUrl` serves a thumbnail. Append `=s0` for the original resolution (desktop screens render at 2560×2048, mobile ~780×2010). If an image looks poor, check the downloaded file size: anything under ~100KB is a thumbnail.

### Generation tool output is not a single JSON document
Responses are huge (40–410KB) and the saved `/tmp/…-copilot-tool-output-*.txt` files typically contain **multiple concatenated objects** — e.g. a raw text object then the structured `outputComponents` object — so `json.load` fails on the trailing data. Parse with a loop using `json.JSONDecoder().raw_decode()`. Also note `outputComponents` may appear twice (a compact string copy plus the pretty-printed object); the string copy must be `json.load`ed again before dict access (check `isinstance(component, str)`). Prop shape: `component['design']['screens'][0]` → `name` (`projects/<pid>/screens/<sid>`), `title`, `screenshot.downloadUrl`, `htmlCode.downloadUrl`.

---

## Ground Rules

- **ALWAYS** check that the Stitch MCP server is active before triggering generation workflows (quick `list_projects` probe; a 401 means re-auth needed — do not proceed).
- **ALWAYS** use numeric/alphanumeric IDs (without `projects/` or `screens/` prefix) for `generate_screen_from_text`, `edit_screens`, `get_screen`, `generate_variants`, and `apply_design_system`.
- **ALWAYS** pass only `id` and `sourceScreen` in `selectedScreenInstances` for `apply_design_system` (omit coordinates and dimensions).
- **ALWAYS** record screen IDs and title→ID mapping from generation responses; never rely solely on `list_screens` for recently generated screens.
- **ALWAYS** ground prototype prompts in the actual codebase before generating: read the real components, theme/palette source, and locale files that the screen will imitate; never invent palettes, layouts, or copy from the plan text alone.
- **ALWAYS** sanity-check generated screens for degenerate output (logo/wordmark instead of a page, blank hero, wrong device dimensions like square 1024×1024 for DESKTOP) and regenerate with a sharper prompt instead of downloading the failure.
- **ALWAYS** verify downloaded files exist, have non-trivial size, and are valid PNG (or HTML, if HTML was requested) before declaring success.
- **ALWAYS** save artifacts with meaningful, kebab-case names derived from the screen title (e.g. `add-payment-form.png`), not raw IDs.
- **NEVER** download HTML files by default — PNG screenshots are the default artifact. Only download `.html` files when the user explicitly asks for HTML output/code.
- **NEVER** spam `generate_screen_from_text` on timeout; wait and verify with `get_screen`.
- **NEVER** delete projects without explicit confirmation from the user.
