# Stitch Build Loop & Multi-Page Baton Protocol

The **Stitch Build Loop** is an autonomous pattern for generating, integrating, and chaining multi-page web applications using Stitch.

---

## 1. Directory Structure

```
project-root/
├── .stitch/
│   ├── metadata.json       # Canonical state (projectId, screen IDs, dimensions)
│   ├── DESIGN.md           # Visual design tokens & semantic rules
│   ├── SITE.md             # Sitemap, page progress, and future roadmap
│   ├── next-prompt.md      # The relay baton containing the current active task
│   └── designs/            # Staging cache for raw Stitch outputs
│       ├── index.html
│       ├── index.png
│       ├── dashboard.html
│       └── dashboard.png
└── site/ or src/           # Target code integration directory
```

---

## 2. The Relay Baton (`.stitch/next-prompt.md`)

The baton file drives autonomous step-by-step progress:

```markdown
---
page: analytics-dashboard
device: DESKTOP
---
An executive analytics dashboard tracking real-time API latency and revenue metrics.

**PAGE STRUCTURE:**
1. Header with date range picker and export button
2. 4 Top Metric Cards (ARR, Active Users, API Latency, Error Rate)
3. Main Chart: 30-day traffic breakdown
4. Bottom Grid: Top performing endpoints and error log table
```

---

## 3. Autonomous Execution Protocol

1. **Read Baton**: Parse `.stitch/next-prompt.md` to extract `page` name and target prompt.
2. **Consult Roadmap**: Check `.stitch/SITE.md` to ensure the page doesn't already exist and is next in sequence.
3. **Execute Generation**: Call `generate_screen_from_text` (or `call_mcp_tool` with server `stitch`).
4. **Download & Save**:
   - Save HTML to `.stitch/designs/{page}.html`.
   - Download high-res screenshot (with `=w1200`) to `.stitch/designs/{page}.png`.
5. **Update State (`.stitch/metadata.json`)**: Save the new screen ID, dimensions, and project ID.
6. **Integrate into Application**:
   - Extract UI components into React/Next.js/HTML components.
   - Wire internal hyperlinks (e.g. change placeholder links to `/{page}`).
7. **Advance Baton**: Update `.stitch/SITE.md` marking the page complete (`[x]`), and overwrite `.stitch/next-prompt.md` with the next task from the roadmap.
