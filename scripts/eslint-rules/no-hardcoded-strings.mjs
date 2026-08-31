// cspell:disable
/**
 * ESLint rule: no-hardcoded-strings
 *
 * Detects user-facing string literals in JSX that should use the i18n
 * translation system (useAppTranslation / getTranslations / getServerTranslations).
 *
 * Per AGENTS.md:
 *   "Never hardcode error strings — always use typed translation functions"
 *   "Client Components: use `useAppTranslation('namespace')` from `@/shared/locale/client`"
 *   "Server Components: use `getTranslations(locale, 'namespace')` from `@/shared/locale/server`"
 *
 * What this rule catches:
 *   1. JSX text children that are user-facing strings (e.g. <h1>Hello</h1>)
 *   2. String literals passed to user-facing props: label, title, hint,
 *      placeholder, aria-label, helperText
 *   3. String literals in arrays/objects used as UI labels (e.g. the DOMAINS
 *      array with `label: "Users"`)
 *
 * What this rule EXEMPTS:
 *   - Brand names: "Draft Academy" (brand identity, not translated)
 *   - CSS property values in style/sx objects (those are caught by
 *     no-hardcoded-colors, not this rule)
 *   - Technical identifiers: table names, enum values, column names
 *   - Import/export paths, regex patterns, HTTP headers
 *   - Strings inside comments
 *   - `value` props (data values, not display labels)
 *   - `name` props on form inputs (HTML attribute, not display)
 *   - `autoComplete` props (browser hint, not display)
 *   - `key` props (React internal, not display)
 *   - Strings that are clearly code: SQL, paths, URLs, env var names
 *   - Strings assigned to variables starting with `_` (intentional ignore)
 *   - `className` / `css` / `style` prop values (CSS, not i18n)
 */

// Brand names that are never translated (identity marks).
const BRAND_NAMES = new Set(["Draft Academy", "Kottaby", "Kottaby Academy"]);

// Props that carry user-facing display text — string literals here must be translated.
const DISPLAY_PROPS = new Set([
  "label",
  "title",
  "hint",
  "placeholder",
  "helperText",
  "aria-label",
  "alt",
  "tooltip",
  "subtitle",
  "description",
  "heading",
  "caption",
]);

// Props that are NOT display text — exempt from the rule.
const NON_DISPLAY_PROPS = new Set([
  "value",
  "name",
  "key",
  "className",
  "css",
  "style",
  "sx",
  "autoComplete",
  "type",
  "variant",
  "color",
  "size",
  "component",
  "href",
  "src",
  "id",
  "htmlFor",
  "ref",
  "action",
  "method",
  "target",
  "rel",
  "download",
  "lang",
  "dir",
  "role",
  "tabIndex",
  "data-testid",
  "data-value",
  "overflow",
  "position",
  "display",
  "flexDirection",
  "alignItems",
  "justifyContent",
  "flexWrap",
  "gap",
  "spacing",
  "direction",
  "width",
  "height",
  "minHeight",
  "maxHeight",
  "minWidth",
  "maxWidth",
  "padding",
  "margin",
  "border",
  "borderRadius",
  "fontWeight",
  "fontSize",
  "fontFamily",
  "lineHeight",
  "letterSpacing",
  "textTransform",
  "opacity",
  "zIndex",
  "flex",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "gridTemplateColumns",
  "gridColumn",
  "gridRow",
  "overflowY",
  "overflowX",
  "whiteSpace",
  "textOverflow",
  "cursor",
  "pointerEvents",
  "boxShadow",
  "transform",
  "transition",
  "animation",
  "borderCollapse",
  "verticalAlign",
  "textAlign",
  "textDecoration",
  "visibility",
  "background",
  "backgroundColor",
  "backgroundImage",
  "backgroundClip",
  "borderBottom",
  "borderTop",
  "borderLeft",
  "borderRight",
  "borderColor",
  "borderWidth",
  "borderStyle",
  "outline",
  "outlineOffset",
  "boxSizing",
  "wordBreak",
  "wordWrap",
  "objectFit",
  "objectPosition",
  "resize",
  "userSelect",
  "listStyle",
  "listStyleType",
  "backdropFilter",
  "filter",
  "clipPath",
  "willChange",
  "isolation",
  "contain",
  "contentVisibility",
  "aspectRatio",
]);

// CSS keyword values that are not user-facing strings.
const CSS_KEYWORDS = new Set([
  "none",
  "auto",
  "inherit",
  "initial",
  "unset",
  "transparent",
  "hidden",
  "visible",
  "scroll",
  "wrap",
  "nowrap",
  "bold",
  "normal",
  "italic",
  "underline",
  "solid",
  "dashed",
  "dotted",
  "pointer",
  "default",
  "center",
  "left",
  "right",
  "top",
  "bottom",
  "stretch",
  "start",
  "end",
  "column",
  "row",
  "fixed",
  "absolute",
  "relative",
  "sticky",
  "static",
  "block",
  "inline",
  "flex",
  "grid",
  "contents",
  "cover",
  "contain",
  "baseline",
  "middle",
  "sub",
  "super",
  "text-top",
  "text-bottom",
  "pre",
  "pre-wrap",
  "pre-line",
  "break-word",
  "break-all",
  "keep-all",
  "revert",
  "ellipsis",
  "clip",
  "collapse",
  "separate",
  "show",
  "hide",
  "fit-content",
  "min-content",
  "max-content",
  "available",
  "border-box",
  "content-box",
  "padding-box",
  "margin-box",
  "stroke-box",
  "fill-box",
  "view-box",
  "border-boundary",
  "content",
  "stroke",
  "fill",
]);

// String patterns that are clearly NOT user-facing (technical values).
const TECHNICAL_PATTERNS = [
  /^[\w-]+\/[\w-]+/, // MIME types: application/json
  /^https?:\/\//, // URLs
  /^\/[\w/-]+/, // file paths: /api/graphql
  /^@[a-z]/, // import paths: @/shared/locale
  /^var\(/, // CSS variables: var(--mui-palette-*)
  /^rgba?\(/, // CSS colors: rgba(0,0,0,0.5)
  /^#[0-9a-fA-F]{3,8}$/, // hex colors: #0d9488
  /^rgb\(/, // CSS colors: rgb(13,148,136)
  /^[a-z]+-[a-z]/, // CSS property values: flex-start, space-between
  /^data:[a-z]/, // data URIs
  /^\w+\.svg$/, // asset filenames
  /^[A-Z_][A-Z_0-9]*$/, // SCREAMING_SNAKE_CASE constants
  /^\w+-\d+$/, // versioned identifiers: drizzle-1.0.0
];

// Check if a string is a brand name (exempt from translation).
function isBrandName(str) {
  return BRAND_NAMES.has(str.trim());
}

// Check if a string looks like a technical value (not user-facing).
function isTechnicalValue(str) {
  const trimmed = str.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length <= 2) return true; // single chars, abbreviations
  if (CSS_KEYWORDS.has(trimmed.toLowerCase())) return true;
  for (const pattern of TECHNICAL_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

// Check if a string is a user-facing display string that should be translated.
// A user-facing string:
//   - Starts with an uppercase letter (sentence/label case)
//   - Contains at least one space (multi-word) OR is a known single-word label
//   - Is not a brand name
//   - Is not a technical value
function isUserFacingString(str) {
  const trimmed = str.trim();
  if (trimmed.length === 0) return false;
  if (isBrandName(trimmed)) return false;
  if (isTechnicalValue(trimmed)) return false;

  // Must start with uppercase letter (user-facing labels are capitalized).
  if (!/^[A-Z]/.test(trimmed)) return false;

  // Must contain at least one space (multi-word label) OR be a known
  // single-word label. Single-word all-caps strings are constants (exempt).
  const hasSpace = /\s/.test(trimmed);
  const isAllCaps = trimmed === trimmed.toUpperCase();
  if (isAllCaps) return false;

  // Multi-word capitalized strings are user-facing labels.
  if (hasSpace) return true;

  // Single-word capitalized strings: check if they look like a label
  // (e.g. "Tables", "Enums", "Triggers", "Domains", "Search").
  // These are user-facing and should be translated.
  // But exclude strings that look like identifiers (camelCase, PascalCase
  // component names, etc.) — those are code, not display text.
  if (/^[A-Z]a-z+$/.test(trimmed)) {
    // Single capitalized word — likely a label. But could also be a
    // component/variable name in a string context. We err on the side of
    // catching it (the developer can suppress if it's a false positive).
    return true;
  }

  return false;
}

const noHardcodedStringsRule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Detect user-facing string literals in JSX that should use the i18n translation system (useAppTranslation / getTranslations). Per AGENTS.md: 'Never hardcode error strings — always use typed translation functions.'",
    },
    messages: {
      noHardcodedString:
        'Hardcoded user-facing string "{{value}}" detected. Use the i18n translation system instead (useAppTranslation for client components, getTranslations for server components, getServerTranslations for API routes). Per AGENTS.md: "Never hardcode strings — always use typed translation functions."',
      noHardcodedPropString:
        'Hardcoded user-facing string "{{value}}" in prop "{{prop}}" detected. Use the i18n translation system instead.',
    },
    schema: [
      {
        type: "object",
        properties: {
          exemptStrings: {
            type: "array",
            items: { type: "string" },
            description: "Additional strings to exempt from the rule (besides brand names).",
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] ?? {};
    const exemptStrings = new Set([...BRAND_NAMES, ...(options.exemptStrings ?? [])]);

    /**
     * Checks a string value and reports if it's a hardcoded user-facing string.
     */
    function checkStringValue(node, value, prop = null) {
      if (typeof value !== "string") return;
      const trimmed = value.trim();
      if (trimmed.length === 0) return;
      if (exemptStrings.has(trimmed)) return;
      if (!isUserFacingString(trimmed)) return;

      context.report({
        node,
        messageId: prop ? "noHardcodedPropString" : "noHardcodedString",
        data: { value: trimmed.length > 40 ? trimmed.substring(0, 37) + "..." : trimmed, prop },
      });
    }

    return {
      // 1. JSX text children: <h1>Hardcoded Title</h1>
      JSXText(node) {
        checkStringValue(node, node.value);
      },

      // 2. String literals in JSX attributes: <Foo label="Hardcoded Label" />
      JSXAttribute(node) {
        const propName = node.name?.name;
        if (!propName) return;

        // Skip non-display props.
        if (NON_DISPLAY_PROPS.has(propName)) return;

        // Only check display props + any unknown prop that looks like it
        // carries display text.
        const isKnownDisplayProp = DISPLAY_PROPS.has(propName);
        const looksLikeDisplayProp =
          !isKnownDisplayProp &&
          /label|title|hint|placeholder|helper|text|caption|subtitle|description|tooltip|alt|heading|message|prompt|name/i.test(
            propName
          ) &&
          !NON_DISPLAY_PROPS.has(propName);

        if (!isKnownDisplayProp && !looksLikeDisplayProp) return;

        // Check the attribute value.
        if (node.value?.type === "Literal" && typeof node.value.value === "string") {
          checkStringValue(node.value, node.value.value, propName);
        } else if (node.value?.type === "JSXExpressionContainer") {
          const expr = node.value.expression;
          if (expr?.type === "Literal" && typeof expr.value === "string") {
            checkStringValue(expr, expr.value, propName);
          } else if (expr?.type === "TemplateLiteral") {
            const rawText = expr.quasis.map(q => q.value.raw).join("");
            checkStringValue(expr, rawText, propName);
          }
        }
      },

      // 3. String literals in object properties used as labels:
      //    const items = [{ label: "Hardcoded" }]
      Property(node) {
        let keyName = null;
        if (node.key?.type === "Identifier") {
          keyName = node.key.name;
        } else if (node.key?.type === "Literal" && typeof node.key.value === "string") {
          keyName = node.key.value;
        }
        if (!keyName) return;

        // Only check display-like keys.
        if (!DISPLAY_PROPS.has(keyName) && keyName !== "label" && keyName !== "title") return;

        // Check the value.
        if (node.value?.type === "Literal" && typeof node.value.value === "string") {
          checkStringValue(node.value, node.value.value, keyName);
        } else if (node.value?.type === "TemplateLiteral") {
          const rawText = node.value.quasis.map(q => q.value.raw).join("");
          checkStringValue(node.value, rawText, keyName);
        }
      },

      // 4. String literals as JSX expression children: <Foo>{"Hardcoded"}</Foo>
      //    and <Foo>{`Hardcoded`}</Foo>
      JSXExpressionContainer(node) {
        // Only check when the expression is a direct child of a JSX element
        // (not inside an attribute — that's handled by JSXAttribute).
        if (node.parent?.type !== "JSXElement" && node.parent?.type !== "JSXFragment") return;

        if (node.expression?.type === "Literal" && typeof node.expression.value === "string") {
          checkStringValue(node.expression, node.expression.value);
        } else if (node.expression?.type === "TemplateLiteral") {
          const rawText = node.expression.quasis.map(q => q.value.raw).join("");
          checkStringValue(node.expression, rawText);
        }
      },
    };
  },
};

export default noHardcodedStringsRule;
