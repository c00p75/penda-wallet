import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { LedgerPage } from '@/features/ledger/LedgerPage'
import { AmbientChat } from '@/features/chat/AmbientChat'

// Every other route is code-split — the home ledger is the only page that
// should be in the initial bundle, since it's what a fresh app-open needs.
const LoginPage = lazy(() => import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const AnalyticsPage = lazy(() =>
  import('@/features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
)
const BudgetsPage = lazy(() => import('@/features/budgets/BudgetsPage').then((m) => ({ default: m.BudgetsPage })))
const GoalsPage = lazy(() => import('@/features/goals/GoalsPage').then((m) => ({ default: m.GoalsPage })))
const ChallengesPage = lazy(() =>
  import('@/features/challenges/ChallengesPage').then((m) => ({ default: m.ChallengesPage })),
)
const SettingsPage = lazy(() => import('@/features/profile/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const CashflowPage = lazy(() =>
  import('@/features/cashflow/CashflowPage').then((m) => ({ default: m.CashflowPage })),
)

function App() {
  return (
    <>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<LedgerPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/budgets" element={<BudgetsPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/challenges" element={<ChallengesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/cashflow" element={<CashflowPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <AmbientChat />
    </>
  )
}

export default App
