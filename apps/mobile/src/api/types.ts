export interface Wallet {
  id: string;
  name: string;
  is_shared: boolean;
  base_currency: string;
  created_by: string;
  created_at: string;
}

export type TransactionType = 'expense' | 'income' | 'transfer';
export type TransactionSource = 'manual' | 'chat' | 'voice' | 'receipt' | 'recurring' | 'sms';

export interface Category {
  id: string;
  wallet_id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  parent_category_id: string | null;
  is_system: boolean;
}

export interface Transaction {
  id: string;
  wallet_id: string;
  created_by: string;
  category_id: string | null;
  amount_minor: number;
  currency: string;
  fx_rate_to_wallet_base: number | null;
  converted_amount_minor: number | null;
  type: TransactionType;
  merchant: string | null;
  description: string | null;
  transaction_date: string;
  source: TransactionSource;
  receipt_storage_path: string | null;
  ai_extraction: Record<string, unknown> | null;
  user_confirmed: boolean;
  version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  category: Category | null;
}

export interface TransactionInput {
  category_id: string | null;
  amount_minor: number;
  currency: string;
  type: TransactionType;
  merchant: string | null;
  description: string | null;
  transaction_date: string;
  source?: TransactionSource;
}

export type BudgetPeriod = 'weekly' | 'monthly';

export interface Budget {
  id: string;
  wallet_id: string;
  category_id: string | null;
  amount_minor: number;
  period: BudgetPeriod;
  rollover: boolean;
  start_date: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetInput {
  category_id: string | null;
  amount_minor: number;
  period: BudgetPeriod;
  rollover: boolean;
}

export interface BudgetProgress {
  budget_id: string;
  category_id: string | null;
  amount_minor: number;
  period: BudgetPeriod;
  rollover: boolean;
  period_start: string;
  period_end: string;
  spent_minor: number;
  carried_over_minor: number;
  effective_amount_minor: number;
}

export interface SavingsGoal {
  id: string;
  wallet_id: string;
  name: string;
  icon: string | null;
  image_path: string | null;
  target_amount_minor: number;
  current_amount_minor: number;
  target_date: string | null;
  motivation: string | null;
  assigned_member_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SavingsGoalInput {
  name: string;
  icon: string | null;
  image_path: string | null;
  target_amount_minor: number;
  target_date: string | null;
  motivation: string | null;
  assigned_member_id?: string | null;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  default_currency: string;
  ai_personality: string;
  mode: string;
  household_size: number | null;
  primary_goal: string | null;
  primary_goals: string[] | null;
  income_range: string | null;
  gender: string;
  notification_opt_in: boolean;
  notification_prefs: Record<string, unknown>;
  ai_consent: Record<string, unknown>;
  ai_trust: Record<string, unknown>;
  blind_budgeting: boolean;
  tax_reserve_pct: number;
  round_up_enabled: boolean;
  pay_yourself_first_pct: number;
  habits_goal_id: string | null;
  created_at: string;
}

export interface ProfileInput {
  display_name?: string | null;
  ai_personality?: string;
  notification_opt_in?: boolean;
  tax_reserve_pct?: number;
  ai_consent?: Record<string, unknown>;
}

export type WalletRole = 'owner' | 'editor' | 'viewer';

export interface WalletMember {
  user_id: string;
  email: string;
  display_name: string | null;
  role: WalletRole;
  joined_at: string;
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurringTemplate {
  category_id: string | null;
  amount_minor: number;
  currency: string;
  type: 'expense' | 'income';
  merchant: string | null;
  description: string | null;
}

export interface RecurringTransaction {
  id: string;
  wallet_id: string;
  created_by: string;
  template: RecurringTemplate;
  frequency: RecurringFrequency;
  next_run_date: string;
  last_run_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type DebtDirection = 'owed_to_me' | 'i_owe';

export interface Debt {
  id: string;
  wallet_id: string;
  name: string;
  direction: DebtDirection;
  counterparty: string | null;
  principal_minor: number;
  balance_minor: number;
  interest_rate: number | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export type MemoryKind = 'note' | 'mood' | 'preference' | 'fact';

export interface AiMemory {
  id: string;
  user_id: string;
  wallet_id: string | null;
  kind: MemoryKind;
  content: string;
  mood: string | null;
  created_at: string;
}

export interface AiMemoryInput {
  wallet_id: string | null;
  kind: MemoryKind;
  content: string;
  mood: string | null;
}

export type MissionStatus = 'active' | 'kept' | 'broken' | 'dismissed';

export interface FinancialMission {
  id: string;
  wallet_id: string;
  created_by: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: MissionStatus;
  created_at: string;
}

export interface FinancialMissionInput {
  title: string;
  description?: string | null;
  start_date: string;
  end_date: string;
  status?: MissionStatus;
}

export type ChallengeType = 'savings_target' | 'spending_limit' | 'no_spend_streak';

export interface ChallengeTargetMetric {
  amount_minor?: number;
  currency?: string;
  days?: number;
}

export interface Challenge {
  id: string;
  name: string;
  creator_id: string;
  type: ChallengeType;
  target_metric: ChallengeTargetMetric;
  start_date: string;
  end_date: string;
  invite_code: string;
  wallet_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChallengeInput {
  name: string;
  type: ChallengeType;
  target_metric: ChallengeTargetMetric;
  start_date: string;
  end_date: string;
  wallet_id: string;
}

export interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  value: number;
  joined_at: string;
}

export interface SplitShareRow {
  id: string;
  split_id: string;
  member_user_id: string;
  share_minor: number;
  settled: boolean;
}

export interface SplitWithMeta {
  id: string;
  wallet_id: string;
  transaction_id: string;
  created_by: string;
  payer_user_id: string;
  amount_minor: number;
  merchant: string | null;
  transaction_date: string;
  shares: SplitShareRow[];
}

export interface SpendingPlan {
  id: string;
  wallet_id: string;
  month: string;
  intended_amount_minor: number;
  reflection: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PlanShare {
  plan_id: string;
  member_id: string;
  allocated_minor: number;
}

export type AiPendingActionStatus = 'pending' | 'confirmed' | 'cancelled' | 'auto_applied';
export type AiPendingActionKind = 'update' | 'delete';

export interface AiPendingAction {
  id: string;
  user_id: string;
  wallet_id: string;
  conversation_id: string | null;
  kind: AiPendingActionKind;
  domain: string;
  target_id: string;
  patch: Record<string, unknown> | null;
  summary: string;
  status: AiPendingActionStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface AppNotification {
  id: string;
  user_id: string;
  wallet_id: string | null;
  kind: string;
  title: string;
  body: string;
  href: string;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface CategoryTotal {
  category: string;
  amount_minor: number;
}

export interface Insight {
  id: string;
  wallet_id: string;
  type: 'weekly_digest' | 'anomaly' | 'recommendation' | 'goal_forecast';
  content: {
    text: string;
    total_spent_minor: number;
    total_income_minor: number;
    top_categories: CategoryTotal[];
  };
  period_start: string | null;
  period_end: string | null;
  dismissed_at: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  pendingActions?: PendingAction[];
  actions?: ChatAction[];
  retryText?: string;
  queued?: boolean;
  viewHref?: string;
  undoTransactionId?: string;
  autoApplied?: boolean;
  streaming?: boolean;
}

export interface PendingAction {
  id: string;
  kind: 'update' | 'delete';
  domain: string;
  summary: string;
  targetId?: string;
}

export interface ChatAction {
  id: string;
  tool: string;
  domain: string;
  label: string;
  summary: string;
  status: 'running' | 'done' | 'error' | 'pending' | 'confirmed' | 'cancelled';
  targetId?: string;
  viewHref?: string;
  pendingKind?: 'update' | 'delete';
  details?: Record<string, string>;
}

export interface ChatResponse {
  conversationId: string;
  reply: string;
  transaction: Record<string, unknown> | null;
  pendingActions?: PendingAction[];
  actions?: ChatAction[];
  autoApplied?: boolean;
}

export interface ConfirmActionResponse {
  ok: boolean;
  status: 'confirmed' | 'cancelled';
  domain: string;
  summary: string;
  targetId?: string;
  kind?: 'update' | 'delete';
}
