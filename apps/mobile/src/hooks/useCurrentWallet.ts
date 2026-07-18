import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWallets } from '@/src/api/wallets';
import { useAuthStore } from '@/src/store/authStore';
import { useWalletStore } from '@/src/store/walletStore';
import type { Wallet } from '@/src/api/types';

export function useCurrentWallet() {
  const userId = useAuthStore((s) => s.session?.user.id);
  const activeWalletId = useWalletStore((s) => s.activeWalletId);
  const setActiveWalletId = useWalletStore((s) => s.setActiveWalletId);

  const query = useQuery({
    queryKey: ['wallets', userId],
    queryFn: () => fetchWallets(userId!),
    enabled: !!userId,
  });

  const wallets = query.data ?? [];

  useEffect(() => {
    if (!wallets.length) return;
    if (!activeWalletId || !wallets.some((w) => w.id === activeWalletId)) {
      setActiveWalletId(wallets[0]!.id);
    }
  }, [wallets, activeWalletId, setActiveWalletId]);

  const wallet: Wallet | undefined = wallets.find((w) => w.id === activeWalletId) ?? wallets[0];

  return {
    wallet,
    wallets,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
