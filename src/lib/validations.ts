import { z } from "zod";

export const signupSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Enter your full name")
    .max(60, "Name is too long"),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const resetPasswordSchema = z.object({
  email: z.email("Enter a valid email address"),
});

export const newPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

export const submissionSchema = z.object({
  reviewer_name: z
    .string()
    .trim()
    .min(2, "Reviewer name is required")
    .max(60, "Name is too long"),
  reviewer_gmail: z.email("Enter a valid Gmail address"),
});

export const withdrawSchema = z.object({
  method: z.literal("bkash"),
  bkash_number: z
    .string()
    .regex(/^01[3-9]\d{8}$/, "Enter a valid bKash number (01XXXXXXXXX)"),
  amount: z.coerce
    .number({ error: "Enter an amount" })
    .min(50, "Minimum withdrawal is 50 TK"),
});

export const generateReviewSchema = z.object({
  task_id: z.uuid("Invalid task"),
});

const optionalPositiveInt = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  return typeof value === "string" ? Number(value) : value;
}, z.number().int().positive().nullable());

const nonNegativeNumber = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return 0;
  return typeof value === "string" ? Number(value) : value;
}, z.number().min(0, "Must be 0 or greater"));

const optionalDateTime = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.string().nullable()
);

export function endAfterStart(data: { start_at?: string | null; end_at?: string | null }) {
  return !data.start_at || !data.end_at || new Date(data.end_at) > new Date(data.start_at);
}

const taskFormObject = z.object({
  app_name: z.string().trim().min(1, "App name is required").max(80),
  app_link: z.url("Enter a valid store URL"),
  package_name: z.string().trim().min(1, "Package name is required"),
  platform: z.enum(["android", "ios"]),
  description: z.string().trim().max(500).optional().default(""),
  banner_url: z.string().trim().max(500).optional().default(""),
  reward: nonNegativeNumber,
  daily_limit: optionalPositiveInt,
  ai_prompt: z.string().trim().min(1, "AI prompt is required").max(4000),
  cron_time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time (e.g. 21:00)"),
  fail_action: z.enum(["pending", "rejected"]),
  start_at: optionalDateTime,
  end_at: optionalDateTime,
  status: z.enum(["active", "inactive"]),
});

export const taskFormSchema = taskFormObject.refine(endAfterStart, {
  message: "End time must be after start time",
  path: ["end_at"],
});

export const taskFormPatchSchema = taskFormObject.partial();

export const adminAdjustSchema = z.object({
  amount: z.coerce
    .number({ error: "Enter an amount" })
    .positive("Amount must be greater than 0")
    .max(1_000_000),
  direction: z.enum(["add", "deduct"]),
  reason: z.string().trim().max(200).optional().default(""),
});

export const adminStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});

export const bulkActionSchema = z.object({
  ids: z.array(z.uuid()).min(1, "Select at least one submission"),
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(200).optional().default(""),
});

export const singleActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(200).optional().default(""),
});

export const withdrawalActionSchema = z.object({
  status: z.enum(["paid", "cancelled"]),
});

export type SignupInput = z.input<typeof signupSchema>;
export type LoginInput = z.input<typeof loginSchema>;
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
export type NewPasswordInput = z.input<typeof newPasswordSchema>;
export type SubmissionInput = z.input<typeof submissionSchema>;
export type WithdrawInput = z.input<typeof withdrawSchema>;
export type TaskFormInput = z.input<typeof taskFormSchema>;
