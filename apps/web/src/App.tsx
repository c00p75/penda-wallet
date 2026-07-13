import { Routes, Route, Navigate } from 'react-router-dom'
import { LedgerPage } from '@/features/ledger/LedgerPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LedgerPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
