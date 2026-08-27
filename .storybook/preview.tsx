// cspell:ignore circlehollow
import type { Decorator, Preview } from "@storybook/react";
import { setupWorker } from "msw/browser";
import { mswLoader } from "msw-storybook-addon/csf3";
import { mswHandlers } from "./msw-handlers";
import { StoryWrapper } from "./StoryWrapper";

// Import global styles
import "@/app/index.css";

const withAllProviders: Decorator = (Story, context) => <StoryWrapper Story={Story} context={context} />;

const preview: Preview = {
  initialGlobals: {
    locale: "ar",
    theme: "dark",
    viewport: "desktop",
  },
  globalTypes: {
    locale: {
      description: "Internationalization locale",
      defaultValue: "ar",
      toolbar: {
        icon: "globe",
        items: [
          { value: "en", right: "🇺🇸", title: "English" },
          { value: "ar", right: "🇦🇪", title: "Arabic" },
        ],
      },
    },
    theme: {
      description: "Global theme for components",
      defaultValue: "dark",
      toolbar: {
        icon: "circlehollow",
        items: [
          { value: "light", icon: "circlehollow", title: "Light" },
          { value: "dark", icon: "circle", title: "Dark" },
        ],
      },
    },
    viewport: {
      description: "Viewport breakpoint for previewing responsive layouts",
      defaultValue: "desktop",
      toolbar: {
        icon: "browser",
        items: [
          { value: "mobile", icon: "mobile", title: "Mobile" },
          { value: "tablet", icon: "tablet", title: "Tablet" },
          { value: "desktop", icon: "browser", title: "Desktop" },
        ],
      },
    },
  },
  loaders: [
    mswLoader(async () => {
      const worker = setupWorker();
      await worker.start({ onUnhandledRequest: "bypass" });
      return worker;
    }),
  ],
  parameters: {
    msw: { handlers: mswHandlers },

    nextjs: {
      appDirectory: true,
    },

    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      test: "todo",
    },
  },
  decorators: [withAllProviders],
};

export default preview;
