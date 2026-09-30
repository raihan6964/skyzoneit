export type Role = "user" | "admin";
export type AccountStatus = "active" | "suspended";
export type TaskStatus = "active" | "inactive";
export type SubmissionStatus = "pending" | "approved" | "rejected";
export type WithdrawalStatus = "pending" | "paid" | "cancelled";
export type FailAction = "pending" | "rejected";
export type Platform = "android" | "ios";

export interface Profile {
  id: string;
  sky_id: string;
  full_name: string | null;
  email: string | null;
  role: Role;
  balance: number;
  status: AccountStatus;
  access_test_passed: boolean;
  access_test_attempts: number;
  created_at: string;
}

export interface Task {
  id: string;
  app_name: string;
  app_link: string;
  package_name: string;
  platform: Platform;
  banner_url: string | null;
  description: string | null;
  reward: number;
  daily_limit: number | null;
  ai_prompt: string;
  cron_time: string;
  fail_action: FailAction;
  start_at: string | null;
  end_at: string | null;
  start_time: string | null;
  end_time: string | null;
  status: TaskStatus;
  last_verify_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Submission {
  id: string;
  user_id: string;
  task_id: string;
  reviewer_name: string;
  reviewer_gmail: string | null;
  screenshot_url: string;
  status: SubmissionStatus;
  submitted_date: string;
  submitted_at: string;
  verified_at: string | null;
  verified_by: "admin" | "cron" | null;
  reward: number;
  verify_attempted: boolean;
  rejection_reason: string | null;
  synced_to_sheet: boolean;
}

export interface SubmissionWithMeta extends Submission {
  task?: Pick<Task, "app_name" | "banner_url" | "platform"> | null;
  profile?: Pick<Profile, "sky_id" | "full_name" | "email"> | null;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  method: "bkash";
  bkash_number: string;
  amount: number;
  status: WithdrawalStatus;
  note: string | null;
  created_at: string;
  processed_at: string | null;
  profile?: Pick<Profile, "sky_id" | "full_name" | "email"> | null;
}

export interface BalanceTransaction {
  id: string;
  user_id: string;
  type: "credit" | "debit";
  amount: number;
  reason: string;
  ref_id: string | null;
  balance_after: number | null;
  created_at: string;
}

export interface CrmStats {
  system_balance: number;
  total_users: number;
  active_users: number;
  pending_submissions: number;
  approved_submissions: number;
  rejected_submissions: number;
  active_tasks: number;
  pending_withdrawals: number;
  paid_withdrawals: number;
}

export interface UserTask extends Task {
  submitted_today: number;
  my_total: number;
  locked: boolean;
  lock_reason: "window" | "limit" | null;
}

export interface SheetRow {
  date: string;
  user_name: string;
  app_name: string;
  reviewer_name: string;
  gmail: string;
  screenshot_link: string;
}

export interface VerifyResult {
  id: string;
  found: boolean;
  matched_name?: string | null;
  review_date?: string | null;
  review_text?: string | null;
}
