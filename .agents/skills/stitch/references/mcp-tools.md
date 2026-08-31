# Stitch MCP Server Tool Reference & Schema Guide

This reference provides exact parameter formats, data types, return structures, and requirements for the **14 core tools** exposed by the Stitch MCP server (`@_davideast/stitch-mcp` or direct HTTP MCP).

---

## Tool Invocation Conventions & ID Formats

> [!IMPORTANT]
> **ID Format Rules:**
> - **Generation & Edit Tools** (`generate_screen_from_text`, `edit_screens`, `generate_variants`, `apply_design_system`): `projectId` and `screenId` must be **numeric/alphanumeric IDs only** (e.g. `"4044680601076201931"`, `"d7237c7d78f44befa4f60afb17c818c1"`). **NEVER** pass `"projects/..."` or `"screens/..."` prefixes.
> - **Resource Read & Project Delete Tools** (`get_project`, `delete_project`): `name` takes the full resource path (e.g. `"projects/4044680601076201931"`).
> - **Design Systems**: `assetId` format is `"assets/{assetId}"` or `{assetId}`.

---

## 1. Project Management Tools

### `create_project`
Creates a new Stitch project. A project acts as a workspace container for screens and design systems.
- **Parameters:**
  - `title` (*string, required*): The human-readable name of the project.
- **Returns:** Project object containing `name` (`projects/{id}`), `projectId`, `title`, `createTime`.

### `list_projects`
Lists all Stitch projects accessible to the authenticated user.
- **Parameters:**
  - `filter` (*string, optional*): e.g. `"view=owned"`.
- **Returns:** Array of project objects.

### `get_project`
Retrieves detailed metadata of a specific project, including attached design systems, device type, canvas positions, and all screen instances.
- **Parameters:**
  - `name` (*string, required*): Full resource name, e.g. `"projects/4044680601076201931"`.
- **Returns:** Full project schema with `screenInstances` (each with `id`, `sourceScreen`, `x`, `y`, `width`, `height`).

### `delete_project`
Deletes a specific Stitch project and its screens.
- **Parameters:**
  - `name` (*string, required*): Full resource name (`projects/{id}`).
- **Safety Gate:** Action is irreversible. Always confirm with the user before calling.

---

## 2. Screen Generation & Editing Tools

### `generate_screen_from_text`
Generates a brand new UI screen from an enhanced structural prompt.
- **Parameters:**
  - `projectId` (*string, required*): Numeric project ID (without `projects/`).
  - `prompt` (*string, required*): Detailed structural prompt (Header, Hero, Content, Footer, interactions).
  - `deviceType` (*string, optional*): `"DESKTOP"` | `"MOBILE"` | `"TABLET"` | `"AGNOSTIC"`. Default: `"DESKTOP"`.
  - `modelId` (*string, optional*): `"GEMINI_3_1_PRO"` (high-fidelity / production) | `"GEMINI_3_FLASH"` (fast wireframe / quick iterations). *(Note: `GEMINI_3_PRO` is deprecated)*.
  - `designSystem` (*string, optional*): Asset identifier (e.g. `"assets/abc123"`).
- **Behavior & Timing:** Takes 60–180 seconds. **DO NOT retry immediately on timeout.** Use `get_screen` to check status.
- **Returns:** `outputComponents` with text descriptions, layout details, and download URLs.

### `edit_screens`
Modifies one or more existing screens in-place with targeted prompt changes.
- **Parameters:**
  - `projectId` (*string, required*): Numeric project ID.
  - `selectedScreenIds` (*array of strings, required*): Array of numeric screen IDs to edit (e.g. `["d7237c7d78f44befa4f60afb17c818c1"]`).
  - `prompt` (*string, required*): Targeted change description (specify element location, change, and "keep everything else the same").
  - `deviceType` (*string, optional*): `"DESKTOP"` | `"MOBILE"` | `"TABLET"`.
  - `modelId` (*string, optional*): `"GEMINI_3_FLASH"` | `"GEMINI_3_1_PRO"`.
- **Returns:** Updated screen object and `outputComponents`.

### `generate_variants`
Explores alternative design directions (layouts, color schemes, typography) for an existing screen.
- **Parameters:**
  - `projectId` (*string, required*): Numeric project ID.
  - `selectedScreenIds` (*array of strings, required*): Array of numeric screen IDs.
  - `prompt` (*string, required*): Direction for exploration.
  - `deviceType` (*string, optional*): `"DESKTOP"` | `"MOBILE"`.
  - `modelId` (*string, optional*): `"GEMINI_3_1_PRO"` | `"GEMINI_3_FLASH"`.
  - `variantOptions` (*object, optional*):
    - `variantCount` (*integer*): Number of variants (1 to 5, default 3).
    - `creativeRange` (*string*): `"REFINE"` (subtle) | `"EXPLORE"` (balanced) | `"REIMAGINE"` (radical rethink).
    - `aspects` (*array of strings*): `["LAYOUT", "COLOR_SCHEME", "IMAGES", "TEXT_FONT", "TEXT_CONTENT"]`.

---

## 3. Screen Asset & Retrieval Tools

### `list_screens`
Lists all screens contained within a Stitch project.
- **Parameters:**
  - `projectId` (*string, required*): Project ID (numeric or full resource name `projects/{id}`).
- **Returns:** List of screens with IDs, titles, dimensions, and creation timestamps.
- **⚠️ Eventual consistency:** frequently omits screens generated seconds earlier, may return stale download URLs, and Stitch may create an untracked empty duplicate screen for an early generation. Always capture screen IDs directly from the `generate_screen_from_text` response and use `get_screen` for fresh metadata.

### `get_screen`
Retrieves full screen metadata including high-res screenshot URL and raw HTML code download URL.
- **Parameters:**
  - `projectId` (*string, required*): Numeric project ID.
  - `screenId` (*string, required*): Numeric screen ID.
  - `name` (*string, optional*): Resource path `projects/{projectId}/screens/{screenId}`.
- **Returns:** Screen object containing:
  - `screenshot.downloadUrl`: Cloud CDN URL. **Bare URL = small blurry thumbnail.** Append `=s0` for original full resolution (preferred), or `=w{width}` for a specific width. Desktop render: 2560×2048.
  - `htmlCode.downloadUrl`: Cloud Storage URL for standalone HTML/Tailwind bundle. Requires `curl -L` (redirects). Download URLs are signed/short-lived — re-fetch with `get_screen` before downloading if time has passed.
  - `width`, `height`, `deviceType`.

### `download_assets`
Downloads all project screens and static assets directly to a local directory.
- **Parameters:**
  - `projectId` (*string, required*): Project ID.
  - `outputDir` (*string, required*): Local filesystem path (e.g. `".stitch/designs"`).
- **⚠️ Known issue:** silently fails — may report success while writing **zero files** (observed with both plan-relative and absolute paths). Always verify the output directory afterwards; if empty, fall back to per-screen `curl -sL` downloads of `htmlCode.downloadUrl` / `screenshot.downloadUrl`.

---

## 4. Design System Tools

### `create_design_system`
Creates a programmatic design system attached to a Stitch project.
- **Parameters:**
  - `projectId` (*string, required*): Numeric project ID.
  - `designSystem` (*object, required*):
    - `displayName` (*string*): Design system title.
    - `theme` (*object*):
      - `colorMode`: `"LIGHT"` | `"DARK"`.
      - `customColor`: Primary brand hex code (e.g. `"#6366F1"`).
      - `colorVariant`: `"MONOCHROME"` | `"NEUTRAL"` | `"TONAL_SPOT"` | `"VIBRANT"` | `"EXPRESSIVE"` | `"FIDELITY"` | `"CONTENT"` | `"RAINBOW"` | `"FRUIT_SALAD"`.
      - `headlineFont`, `bodyFont`, `labelFont`: One of 29 supported fonts (`INTER`, `MONTSERRAT`, `GEIST`, `DM_SANS`, `PLUS_JAKARTA_SANS`, `SPACE_GROTESK`, `PUBLIC_SANS`, `MANROPE`, `EPILOGUE`, `RUBIK`, `SORA`, `LEXEND`, etc.).
      - `roundness`: `"ROUND_FOUR"` (4px) | `"ROUND_EIGHT"` (8px) | `"ROUND_TWELVE"` (12px) | `"ROUND_FULL"` (pill/full).
      - `designMd`: Free-form markdown instructions and design rationale.

### `update_design_system`
Updates existing design system tokens and visual theme for a project.
- **Parameters:**
  - `projectId` (*string, required*): Numeric project ID.
  - `name` (*string, required*): Design system asset name (`assets/{assetId}`).
  - `designSystem` (*object, required*): Updated theme parameters.

### `list_design_systems`
Lists all design systems created or attached to a given project.
- **Parameters:**
  - `projectId` (*string, required*): Numeric project ID.

### `upload_design_md`
Uploads a base64-encoded `DESIGN.md` document to a Stitch project.
- **Parameters:**
  - `projectId` (*string, required*): Numeric project ID.
  - `designMdBase64` (*string, required*): Base64-encoded UTF-8 string of `DESIGN.md` (`base64 -w 0 DESIGN.md`).
- **Post-requisite:** Call `create_design_system_from_design_md` immediately after this tool.

### `create_design_system_from_design_md`
Transforms an uploaded `DESIGN.md` into an active Stitch project Design System.
- **Parameters:**
  - `projectId` (*string, required*): Numeric project ID.
  - `selectedScreenInstance` (*object, required*): `{ id, sourceScreen }` returned from upload step.
  - `deviceType` (*string, optional*): `"DESKTOP"` | `"MOBILE"`.

### `apply_design_system`
Applies an existing design system asset to selected screen instances.
- **Parameters:**
  - `projectId` (*string, required*): Numeric project ID.
  - `assetId` (*string, required*): Target design system asset identifier.
  - `selectedScreenInstances` (*array of objects, required*): Array of `{ id: string, sourceScreen: string }`.
  - > [!CAUTION]
    > `selectedScreenInstances` must contain **only** `id` and `sourceScreen`. Never include `x`, `y`, `width`, or `height`, or the API will return "invalid argument".
