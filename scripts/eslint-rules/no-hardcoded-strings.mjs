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
 *
 * Structure:
 *   - `no-hardcoded-strings.constants.mjs` — prop/keyword/pattern sets
 *   - `no-hardcoded-strings.helpers.mjs` — string classification predicates
 */

import { BRAND_NAMES, DISPLAY_PROPS, NON_DISPLAY_PROPS } from "./no-hardcoded-strings.constants.mjs";
import { isUserFacingString } from "./no-hardcoded-strings.helpers.mjs";

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
