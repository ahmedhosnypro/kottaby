import { AUTOFILL_BACKGROUND_VAR, AUTOFILL_TEXT_VAR } from "@/frontend/providers/theme/overrides/autofill";

export const getMuiInputOverrides = () => ({
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        "& input:-webkit-autofill": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
          WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
          caretColor: `${AUTOFILL_TEXT_VAR} !important`,
          borderRadius: "inherit",
          transition: "background-color 5000s ease-in-out 0s",
        },
        "& input:-webkit-autofill:hover": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
          WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
        },
        "& input:-webkit-autofill:focus": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
          WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
        },
        "& input:-webkit-autofill:active": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
          WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
        },
      },
      input: {
        "&:-webkit-autofill": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
          WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
          caretColor: `${AUTOFILL_TEXT_VAR} !important`,
          borderRadius: "inherit",
        },
        "&:-webkit-autofill:hover": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
        },
        "&:-webkit-autofill:focus": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
        },
        "&:-webkit-autofill:active": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
        },
      },
    },
  },
  MuiInputBase: {
    styleOverrides: {
      input: {
        "&:-webkit-autofill": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
          WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
          caretColor: `${AUTOFILL_TEXT_VAR} !important`,
        },
        "&:-webkit-autofill:hover, &:-webkit-autofill:focus, &:-webkit-autofill:active": {
          WebkitBoxShadow: `0 0 0 100px ${AUTOFILL_BACKGROUND_VAR} inset !important`,
          WebkitTextFillColor: `${AUTOFILL_TEXT_VAR} !important`,
        },
      },
    },
  },
});
