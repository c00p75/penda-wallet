import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { HomePage } from '@/features/home/HomePage'
import { AmbientChat } from '@/features/chat/AmbientChat'
import { LockPrompt } from '@/features/lock/UnlockSheet'
import { useOfflineQueueSync } from '@/pwa/useOfflineQueue'

// Every other route is code-split, the home dashboard is the only page that
// should be in the initial bundle, since it's what a fresh app-open needs.
const LoginPage = lazy(() => import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const LedgerPage = lazy(() => import('@/features/ledger/LedgerPage').then((m) => ({ default: m.LedgerPage })))
const AnalyticsPage = lazy(() =>
  import('@/features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
)
const BudgetsPage = lazy(() => import('@/features/budgets/BudgetsPage').then((m) => ({ default: m.BudgetsPage })))
const GoalsPage = lazy(() => import('@/features/goals/GoalsPage').then((m) => ({ default: m.GoalsPage })))
const GoalDetailPage = lazy(() =>
  import('@/features/goals/GoalDetailPage').then((m) => ({ default: m.GoalDetailPage })),
)
const ChallengesPage = lazy(() =>
  import('@/features/challenges/ChallengesPage').then((m) => ({ default: m.ChallengesPage })),
)
const SettingsPage = lazy(() => import('@/features/profile/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const CashflowPage = lazy(() =>
  import('@/features/cashflow/CashflowPage').then((m) => ({ default: m.CashflowPage })),
)
const JournalPage = lazy(() =>
  import('@/features/memory/JournalPage').then((m) => ({ default: m.JournalPage })),
)
const SimulatorPage = lazy(() =>
  import('@/features/simulator/SimulatorPage').then((m) => ({ default: m.SimulatorPage })),
)
const BusinessHubPage = lazy(() =>
  import('@/features/business/BusinessHubPage').then((m) => ({ default: m.BusinessHubPage })),
)
const MissionsPage = lazy(() =>
  import('@/features/missions/MissionsPage').then((m) => ({ default: m.MissionsPage })),
)
const ActivityLogPage = lazy(() =>
  import('@/features/activity/ActivityLogPage').then((m) => ({ default: m.ActivityLogPage })),
)
const AiActionsPage = lazy(() =>
  import('@/features/audit/AiActionsPage').then((m) => ({ default: m.AiActionsPage })),
)
const FamilyHubPage = lazy(() =>
  import('@/features/family/FamilyHubPage').then((m) => ({ default: m.FamilyHubPage })),
)
const SettleUpPage = lazy(() =>
  import('@/features/splits/SettleUpPage').then((m) => ({ default: m.SettleUpPage })),
)
const MoneyRadarPage = lazy(() =>
  import('@/features/radar/MoneyRadarPage').then((m) => ({ default: m.MoneyRadarPage })),
)
const NotificationsPage = lazy(() =>
  import('@/features/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
)

function OfflineQueueHost() {
  useOfflineQueueSync()
  return null
}

function App() {
  return (
    <>
      <OfflineQueueHost />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/transactions" element={<LedgerPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/budgets" element={<BudgetsPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/goals/:id" element={<GoalDetailPage />} />
          <Route path="/challenges" element={<ChallengesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/cashflow" element={<CashflowPage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/simulator" element={<SimulatorPage />} />
          <Route path="/business" element={<BusinessHubPage />} />
          <Route path="/missions" element={<MissionsPage />} />
          <Route path="/activity" element={<ActivityLogPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/ai-actions" element={<AiActionsPage />} />
          <Route path="/family" element={<FamilyHubPage />} />
          <Route path="/settle-up" element={<SettleUpPage />} />
          <Route path="/radar" element={<MoneyRadarPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <AmbientChat />
      <LockPrompt />
    </>
  )
}

export default App
