import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts, Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet } from 'react-native';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/store/authStore';
import { LockGate } from '@/src/components/LockGate';
import { useSmsIngest } from '@/src/hooks/useSmsIngest';
import { colors } from '@/src/lib/theme';

WebBrowser.maybeCompleteAuthSession();
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

async function createSessionFromUrl(url: string) {
  const hashIndex = url.indexOf('#');
  const queryString = hashIndex >= 0 ? url.slice(hashIndex + 1) : url.split('?')[1] ?? '';
  const params = new URLSearchParams(queryString);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return;
  await supabase.auth.setSession({ access_token, refresh_token });
}

function AuthHooks() {
  const session = useAuthStore((s) => s.session);
  useSmsIngest();
  if (!session) return null;
  return <LockGate />;
}

export default function RootLayout() {
  const init = useAuthStore((s) => s.init);
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  });

  useEffect(() => {
    const cleanup = init();
    return cleanup;
  }, [init]);

  useEffect(() => {
    const handleUrl = (url: string) => {
      void createSessionFromUrl(url);
    };

    void Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <AuthHooks />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="chat"
            options={{
              presentation: 'transparentModal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen name="ledger" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="add-transaction" options={{ presentation: 'modal' }} />
          <Stack.Screen name="add-budget" options={{ presentation: 'modal' }} />
          <Stack.Screen name="add-goal" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="cashflow" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="journal" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="simulator" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="business" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="family" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="challenges" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="missions" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="settle-up" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="activity" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="ai-actions" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="lock-setup" options={{ presentation: 'modal' }} />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
