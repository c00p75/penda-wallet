/** Re-export shared undo allowlists so web and mobile cannot drift. */
export {
  DOMAIN_TABLES,
  buildBeforeSnapshot,
  buildReinsertRow,
  canUndoAiAction,
  filterRestorePatch,
  filterUpdatePatch,
  isUndoDomain,
  type DomainTableCfg,
  type UndoActionLike,
  type UndoDomain,
} from '@penda/money-core'
