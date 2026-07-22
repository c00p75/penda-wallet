/**
 * Cashflow projection now lives in the shared @penda/money-core package so the
 * web and mobile apps stay in lockstep (this logic was previously copy-pasted
 * and had begun to drift). Re-exported here to keep the existing import path
 * stable for the rest of the mobile app.
 */
export {
  projectCashflow,
  type ProjectedEventKind,
  type ProjectedEvent,
  type ProjectedDay,
  type CashflowProjection,
  type ProjectCashflowInput,
} from '@penda/money-core';
