import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { uploadReceipt } from './api'

export function useUploadReceipt(walletId: string | undefined) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.session?.user.id)

  return useMutation({
    mutationFn: (file: File) => uploadReceipt(walletId!, userId!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', walletId] })
      // Free preview is claimed server-side on first scan — refresh so the
      // next tap shows the paywall instead of opening the picker again.
      queryClient.invalidateQueries({ queryKey: ['entitlement', userId] })
    },
  })
}
