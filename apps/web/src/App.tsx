import { Routes, Route, Navigate } from 'react-router-dom'
import { LedgerPage } from '@/features/ledger/LedgerPage'
import { LoginPage } from '@/features/auth/LoginPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LedgerPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
