import noHardcodedColors from "./no-hardcoded-colors.mjs";
import noHardcodedStrings from "./no-hardcoded-strings.mjs";

export const localRulesPlugin = {
  rules: {
    "no-hardcoded-colors": noHardcodedColors,
    "no-hardcoded-strings": noHardcodedStrings,
  },
};
