import { useState } from 'react'
import { fetchExportBundle } from './api'
import { buildExportJSON, buildTransactionsCSV } from './exportData'

function download(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Data export, ownership builds trust, and it's an app-store/privacy expectation. */
export function useExport(walletId: string | undefined) {
  const [isExporting, setIsExporting] = useState(false)

  async function exportAs(format: 'json' | 'csv') {
    if (!walletId) return
    setIsExporting(true)
    try {
      const bundle = await fetchExportBundle(walletId)
      const stamp = new Date().toISOString().slice(0, 10)
      if (format === 'json') {
        download(buildExportJSON(bundle), `penda-export-${stamp}.json`, 'application/json')
      } else {
        download(buildTransactionsCSV(bundle), `penda-transactions-${stamp}.csv`, 'text/csv')
      }
    } finally {
      setIsExporting(false)
    }
  }

  return { exportAs, isExporting }
}
