/**
 * Scenario + debt-payoff modelling now lives in the shared @penda/money-core
 * package (was copy-pasted between web and mobile). Re-exported here to keep
 * the existing import path stable.
 */
export {
  simulateScenario,
  projectDebtPayoff,
  type ScenarioAdjustments,
  type ScenarioResult,
  type DebtPayoffInput,
  type DebtPayoffResult,
} from '@penda/money-core'
