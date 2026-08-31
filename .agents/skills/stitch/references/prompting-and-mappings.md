# Stitch Prompting & Design System Mapping Reference

This reference provides the UI/UX keyword mappings, architectural terminology, and prompt structure templates to transform generic requests into high-fidelity Stitch screens.

---

## 1. Professional UI/UX Terminology Mapping

Always convert vague user requests into specific architectural and component terms:

| Vague User Term | Professional Term | Detailed Prompt Expansion |
|:---|:---|:---|
| "menu at the top" | Sticky Navigation Bar | "Sticky glassmorphism navbar with brand mark on the left, pill-shaped nav links centered, and primary action button on the right." |
| "big photo on top" | Hero Section | "Full-width editorial hero section with high-contrast headline, supportive subtitle, dual CTAs, and responsive product visual container." |
| "list of cards / items" | Responsive Grid Layout | "Auto-fit responsive card grid (3 columns desktop, 1 column mobile) with subtle 1px border, hover elevation, and meta badges." |
| "popup window" | Modal Dialog | "Accessible modal dialog overlay with backdrop blur, clear header, form inputs with inline error validation, and bottom action footer." |
| "sidebar menu" | Collapsible Navigation Sidebar | "Vertical drawer navigation with active indicator bar, grouped category headers, notification badges, and user profile pill at bottom." |
| "stats numbers" | KPI / Metric Card Grid | "Dashboard stat cards featuring numeric KPI counters, trend indicators (+12% vs last month with micro-sparkline), and muted description labels." |
| "table with data" | Data Table / Data Grid | "Dense data table featuring sticky column headers, sorting toggles, zebra striping, status chips, and pagination footer." |
| "dark mode" | OLED Dark Theme | "Deep slate / dark charcoal background (#0F172A) with high-contrast neutral text (#F8FAFC) and vibrant accent highlights." |

---

## 2. Style Keyword Bank

Use these style descriptors when guiding design generation and variant exploration:

### Layout & Composition
- **Bento Grid**: Modular, high-density rectangular compartments with varying aspect ratios.
- **Editorial Broadside**: High-contrast typography, generous whitespace, asymmetric column balance, journalistic feel.
- **Swiss Style**: Rigid grid discipline, bold sans-serif typography, asymmetric layout, functional clarity.
- **Minimalist Modern**: Low visual noise, generous padding, subtle 1px borders, subtle elevation.

### Surface & Texture
- **Glassmorphism**: Semi-transparent frosted glass cards with `backdrop-filter: blur(12px)` and 1px white/subtle border.
- **Claymorphism**: Soft, rounded 3D cards with dual inner/outer shadows.
- **Matte & Monochrome**: High-contrast dark charcoal / off-white with muted border dividers.

---

## 3. Stitch Prompt Templates

### A. New Screen Template (`generate_screen_from_text`)

```markdown
[Overall vibe, aesthetic mood, and core user intent of the screen]

**PLATFORM:** [Web / Mobile], [Desktop / Mobile]-first
**DEVICE:** [DESKTOP / MOBILE / TABLET]

**PAGE STRUCTURE:**
1. **Header / Navigation:** [Detailed layout, brand mark, navigation items, actions]
2. **Hero / Primary Focal Area:** [Headline, sub-copy, interactive widgets / visuals, primary CTA]
3. **Core Content Modules:**
   - **Section A:** [Detailed breakdown: grid structure, card components, badge states]
   - **Section B:** [Data visualizations, tables, lists, or interactive workflows]
4. **Footer / Secondary Navigation:** [Informational links, legal, newsletter or secondary CTA]

**INTERACTION DETAILS:**
- Explicit hover states on cards and buttons.
- Input focus rings and active states.
```

### B. Screen Edit Template (`edit_screens`)

```markdown
Target: [Specific Screen ID / Element Location]

1. **Location**: In the [Hero section / Navigation bar / Feature card grid]
2. **Action**: [Modify / Replace / Add / Remove]
3. **Exact Change**: Change the primary button background to Deep Indigo (#4F46E5) with subtle hover scale, and add a secondary ghost button "View Docs".
4. **Preservation**: Keep all other sections, typography, layout, and colors exactly the same.
```

### C. Variant Exploration Template (`generate_variants`)

```markdown
Explore 3 creative directions for the [Dashboard Hero / Pricing Cards / Navigation]:
- Direction 1: Bento grid arrangement with integrated metrics.
- Direction 2: Asymmetric split-screen layout with interactive preview.
- Direction 3: High-density compact tabular layout.
```
