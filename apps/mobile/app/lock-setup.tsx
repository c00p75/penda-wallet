import { useRouter } from 'expo-router';
import { SetupLockModal } from '@/src/components/LockGate';

export default function LockSetupScreen() {
  const router = useRouter();

  return (
    <SetupLockModal
      visible
      onClose={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/settings');
      }}
    />
  );
}
