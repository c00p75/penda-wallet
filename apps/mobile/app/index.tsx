import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { LoadingView } from '@/src/components/ui';
import { useAuthStore } from '@/src/store/authStore';
import { fetchWallets } from '@/src/api/wallets';

export default function Index() {
  const session = useAuthStore((s) => s.session);
  const isLoading = useAuthStore((s) => s.isLoading);

  const { data: wallets, isLoading: walletsLoading } = useQuery({
    queryKey: ['wallets', session?.user.id],
    queryFn: () => fetchWallets(session!.user.id),
    enabled: !!session?.user.id,
  });

  if (isLoading) return null;
  if (!session) return <Redirect href="/login" />;
  if (walletsLoading) return <LoadingView label="Loading your wallets…" />;
  if (!wallets?.length) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
