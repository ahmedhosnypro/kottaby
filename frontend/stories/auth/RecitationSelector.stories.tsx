import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RecitationSelector } from "@/app/(auth)/register/RecitationSelector";
import { RecitationReading } from "@/frontend/graphql/generated/gql/graphql";
import { recitationAr } from "@/shared/locale/ar/recitation";
import { recitationEn } from "@/shared/locale/en/recitation";

const meta = {
  title: "Auth/RecitationSelector",
  component: RecitationSelector,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    value: {
      control: "select",
      options: ["", ...Object.values(RecitationReading)],
    },
  },
} satisfies Meta<typeof RecitationSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

const allReadings = Object.values(RecitationReading);

export const DefaultArabic: Story = {
  args: {
    value: "",
    onChange: () => {},
    labels: recitationAr,
    options: allReadings,
    loading: false,
  },
};

export const DefaultEnglish: Story = {
  args: {
    value: "",
    onChange: () => {},
    labels: recitationEn,
    options: allReadings,
    loading: false,
  },
};

export const WithSelection: Story = {
  args: {
    value: RecitationReading.HafsAnAsim,
    onChange: () => {},
    labels: recitationAr,
    options: allReadings,
    loading: false,
  },
};

export const Loading: Story = {
  args: {
    value: "",
    onChange: () => {},
    labels: recitationAr,
    options: [],
    loading: true,
  },
};
