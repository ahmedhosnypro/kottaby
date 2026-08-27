// cspell:disable
const colorProps = new Set([
  "color",
  "bgcolor",
  "backgroundColor",
  "borderColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "fill",
  "stroke",
  "outlineColor",
]);

const allowedLiteralValues = new Set(["transparent", "inherit", "currentcolor", "none", "initial", "unset", "revert"]);

const muiComponentColors = new Set([
  "primary",
  "secondary",
  "error",
  "warning",
  "info",
  "success",
  "default",
  "inherit",
  "action",
  "disabled",
]);

function isAllowedCssFunction(str) {
  const trimmed = str.trim().toLowerCase();
  return (
    allowedLiteralValues.has(trimmed) ||
    trimmed.startsWith("var(") ||
    trimmed.startsWith("color-mix(") ||
    trimmed.startsWith("env(") ||
    trimmed.startsWith("rgba(var(") ||
    trimmed.startsWith("rgb(var(")
  );
}

function checkValue(node, context, allowMuiColors = false) {
  if (!node) return;

  if (node.type === "Literal" && typeof node.value === "string") {
    const val = node.value.trim().toLowerCase();
    if (!isAllowedCssFunction(val) && (!allowMuiColors || !muiComponentColors.has(val))) {
      context.report({
        node,
        messageId: "noHardcodedColor",
      });
    }
  } else if (node.type === "TemplateLiteral") {
    const rawText = node.quasis.map(q => q.value.raw).join("");
    if (!isAllowedCssFunction(rawText) && !rawText.includes("var(") && !rawText.includes("color-mix(")) {
      context.report({
        node,
        messageId: "noHardcodedColor",
      });
    }
  } else if (node.type === "ConditionalExpression") {
    checkValue(node.consequent, context, allowMuiColors);
    checkValue(node.alternate, context, allowMuiColors);
  } else if (node.type === "LogicalExpression") {
    checkValue(node.left, context, allowMuiColors);
    checkValue(node.right, context, allowMuiColors);
  }
}

const noHardcodedColorsRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid usage of hardcoded colors or string-based palette access in props and sx/style objects. Use theme.palette instead.",
    },
    messages: {
      noHardcodedColor:
        "Avoid using string literals for colors. Use the theme callback pattern instead (e.g., sx={(theme) => ({ color: theme.palette.primary.main })}).",
    },
    schema: [], // no options
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name?.type === "JSXIdentifier" && colorProps.has(node.name.name)) {
          if (node.value) {
            const isColorProp = node.name.name === "color";
            if (node.value.type === "Literal") {
              checkValue(node.value, context, isColorProp);
            } else if (node.value.type === "JSXExpressionContainer") {
              checkValue(node.value.expression, context, isColorProp);
            }
          }
        }
      },
      Property(node) {
        const key = node.key;
        let keyName;
        if (key.type === "Identifier") {
          keyName = key.name;
        } else if (key.type === "Literal" && typeof key.value === "string") {
          keyName = key.value;
        }

        if (keyName && colorProps.has(keyName)) {
          const isColorKey = keyName === "color";
          checkValue(node.value, context, isColorKey);
        }
      },
    };
  },
};

export default noHardcodedColorsRule;
