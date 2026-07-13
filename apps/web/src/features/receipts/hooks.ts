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
    },
  })
}
