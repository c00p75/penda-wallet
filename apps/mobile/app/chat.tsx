import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { ChatSheet } from '@/src/components/ChatSheet';
import { LoadingView } from '@/src/components/ui';
import { useCurrentWallet } from '@/src/hooks/useCurrentWallet';
import { useChatStore } from '@/src/store/chatStore';

export default function ChatModal() {
  const router = useRouter();
  const { wallet, isLoading } = useCurrentWallet();
  const closeChat = useChatStore((s) => s.closeChat);

  const handleClose = () => {
    closeChat();
    router.back();
  };

  if (isLoading || !wallet) {
    return (
      <View style={styles.backdrop}>
        <LoadingView />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BlurView intensity={20} style={styles.backdrop} tint="dark" />
      <View style={styles.sheetWrap}>
        <ChatSheet walletId={wallet.id} currency={wallet.base_currency} onClose={handleClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheetWrap: {
    height: '92%',
  },
});
