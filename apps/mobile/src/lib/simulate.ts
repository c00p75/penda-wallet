import {
  projectCashflow,
  type CashflowProjection,
  type ProjectCashflowInput,
} from '@/src/lib/cashflowProjection';

export interface ScenarioAdjustments {
  oneOffMinor?: number;
  spendCutPct?: number;
  extraDebtPaymentMinor?: number;
}

export interface ScenarioResult {
  baseline: CashflowProjection;
  scenario: CashflowProjection;
  endDeltaMinor: number;
  lowestDeltaMinor: number;
  canAfford: boolean;
}

function endBalance(p: CashflowProjection): number {
  return p.days.length ? p.days[p.days.length - 1].balanceMinor : 0;
}

export function simulateScenario(base: ProjectCashflowInput, adj: ScenarioAdjustments): ScenarioResult {
  const oneOff = (adj.oneOffMinor ?? 0) + (adj.extraDebtPaymentMinor ?? 0);
  const cut = Math.min(100, Math.max(0, adj.spendCutPct ?? 0));

  const baseline = projectCashflow(base);
  const scenario = projectCashflow({
    ...base,
    startingBalanceMinor: base.startingBalanceMinor - oneOff,
    avgDailySpendMinor: Math.round(base.avgDailySpendMinor * (1 - cut / 100)),
  });

  return {
    baseline,
    scenario,
    endDeltaMinor: endBalance(scenario) - endBalance(baseline),
    lowestDeltaMinor: scenario.lowestBalance.balanceMinor - baseline.lowestBalance.balanceMinor,
    canAfford: scenario.lowestBalance.balanceMinor >= 0,
  };
}

export interface DebtPayoffInput {
  balanceMinor: number;
  annualRatePct: number | null;
  extraMonthlyMinor: number;
}

export interface DebtPayoffResult {
  monthsToPayoff: number | null;
  totalInterestMinor: number | null;
}

export function projectDebtPayoff(input: DebtPayoffInput): DebtPayoffResult {
  const { balanceMinor, annualRatePct, extraMonthlyMinor } = input;
  if (balanceMinor <= 0) return { monthsToPayoff: 0, totalInterestMinor: 0 };
  if (extraMonthlyMinor <= 0) return { monthsToPayoff: null, totalInterestMinor: null };

  const monthlyRate = (annualRatePct ?? 0) / 100 / 12;
  if (monthlyRate <= 0) {
    const months = Math.ceil(balanceMinor / extraMonthlyMinor);
    return { monthsToPayoff: months, totalInterestMinor: 0 };
  }

  const firstMonthInterest = balanceMinor * monthlyRate;
  if (extraMonthlyMinor <= firstMonthInterest) return { monthsToPayoff: null, totalInterestMinor: null };

  const months = Math.ceil(-Math.log(1 - (monthlyRate * balanceMinor) / extraMonthlyMinor) / Math.log(1 + monthlyRate));
  const totalInterestMinor = Math.round(months * extraMonthlyMinor - balanceMinor);
  return { monthsToPayoff: months, totalInterestMinor };
}
