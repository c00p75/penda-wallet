import { Routes, Route, Navigate } from 'react-router-dom'
import { LedgerPage } from '@/features/ledger/LedgerPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage'
import { BudgetsPage } from '@/features/budgets/BudgetsPage'
import { GoalsPage } from '@/features/goals/GoalsPage'
import { ChallengesPage } from '@/features/challenges/ChallengesPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LedgerPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
      <Route path="/budgets" element={<BudgetsPage />} />
      <Route path="/goals" element={<GoalsPage />} />
      <Route path="/challenges" element={<ChallengesPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
