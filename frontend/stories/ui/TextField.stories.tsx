import { EmailOutlined, LockOutlined, PersonOutlined, PhoneOutlined } from "@mui/icons-material";
import { Box, InputAdornment, Stack, TextField } from "@mui/material";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  title: "Form/TextField",
  component: TextField,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    label: "الاسم الكامل",
    placeholder: "أدخل اسمك",
    fullWidth: true,
  },
};

export const WithIcon: Story = {
  render: () => (
    <Stack spacing={2} sx={{ maxWidth: 400 }}>
      <TextField
        label="الاسم الكامل"
        placeholder="أدخل اسمك"
        fullWidth
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <PersonOutlined fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
      />
      <TextField
        label="البريد الإلكتروني"
        type="email"
        placeholder="example@test.local"
        fullWidth
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <EmailOutlined fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
      />
      <TextField
        label="رقم الهاتف"
        type="tel"
        placeholder="+20 123 456 7890"
        fullWidth
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <PhoneOutlined fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
      />
      <TextField
        label="كلمة المرور"
        type="password"
        fullWidth
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <LockOutlined fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
      />
    </Stack>
  ),
};

export const WithError: Story = {
  args: {
    label: "كلمة المرور",
    type: "password",
    error: true,
    helperText: "كلمة المرور قصيرة جداً",
    fullWidth: true,
  },
};

export const Grid2Col: Story = {
  render: () => (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, maxWidth: 600 }}>
      <TextField label="الاسم الكامل" fullWidth />
      <TextField label="البريد الإلكتروني" type="email" fullWidth />
      <TextField label="رقم الهاتف" type="tel" fullWidth />
      <TextField label="الدولة" fullWidth />
    </Box>
  ),
};
