import { useEffect, useRef } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { parseMoMoText } from '@/src/lib/momoParser';
import { createTransaction } from '@/src/api/transactions';
import { fetchProfile } from '@/src/api/profile';
import { useAuthStore } from '@/src/store/authStore';
import { useWalletStore } from '@/src/store/walletStore';
import { useSmsStore } from '@/src/store/smsStore';
import type { Wallet } from '@/src/api/types';

type SmsListenerModule = typeof import('expo-sms-listener');

const SMS_QUEUE_KEY = 'penda-sms-queue';

/**
 * Android ambient MoMo/bank SMS ingest.
 * Requires a development build or EAS binary (not Expo Go). Toggle in Settings.
 */
export function useSmsIngest() {
  const session = useAuthStore((s) => s.session);
  const activeWalletId = useWalletStore((s) => s.activeWalletId);
  const enabled = useSmsStore((s) => s.enabled);
  const queryClient = useQueryClient();
  const processing = useRef(new Set<string>());

  useEffect(() => {
    if (Platform.OS !== 'android' || !session?.user.id || !activeWalletId || !enabled) {
      return;
    }

    let cancelled = false;
    let removeSub: (() => void) | undefined;
    let mod: SmsListenerModule | null = null;

    async function handleSms(body: string, opts?: { silent?: boolean }) {
      if (!body.trim() || !session?.user.id || !activeWalletId) return;
      const key = `${body.slice(0, 80)}:${body.length}`;
      if (processing.current.has(key)) return;
      processing.current.add(key);

      try {
        const parsed = parseMoMoText(body);
        if (!parsed) return;

        const profile = await fetchProfile(session.user.id);
        if (profile.ai_consent?.auto_log_sms === false) return;

        const wallets = queryClient.getQueryData<Wallet[]>(['wallets', session.user.id]) ?? [];
        const wallet = wallets.find((w) => w.id === activeWalletId);
        const currency =
          parsed.currencyHint ?? wallet?.base_currency ?? profile.default_currency ?? 'ZMW';

        await createTransaction(activeWalletId, session.user.id, {
          type: parsed.type,
          amount_minor: parsed.amountMinor,
          currency,
          category_id: null,
          merchant: parsed.merchant ?? null,
          description: parsed.reference
            ? `SMS ref ${parsed.reference}`
            : 'Auto-logged from SMS',
          transaction_date: parsed.transactionDate,
          source: 'sms',
        });

        void queryClient.invalidateQueries({ queryKey: ['transactions', activeWalletId] });
        if (!opts?.silent) {
          Alert.alert(
            'Transaction logged',
            `${parsed.type === 'income' ? 'Income' : 'Expense'} from SMS was added to your ledger.`,
          );
        }
      } catch {
        // Ignore parse or network errors
      } finally {
        setTimeout(() => processing.current.delete(key), 5000);
      }
    }

    async function drainQueue() {
      try {
        const raw = await AsyncStorage.getItem(SMS_QUEUE_KEY);
        if (!raw) return;
        const queue = JSON.parse(raw) as Array<{ body?: string }>;
        await AsyncStorage.removeItem(SMS_QUEUE_KEY);
        if (!Array.isArray(queue)) return;
        for (const item of queue) {
          if (typeof item?.body === 'string') {
            await handleSms(item.body, { silent: true });
          }
        }
      } catch {
        // ignore
      }
    }

    void (async () => {
      try {
        mod = await import('expo-sms-listener');
        if (cancelled) return;

        const permission = await mod.requestSmsPermissionAsync();
        if (!permission.granted) return;

        await mod.startSmsListenerServiceAsync();
        if (cancelled) {
          await mod.stopSmsListenerServiceAsync();
          return;
        }

        await drainQueue();

        const sub = mod.addSmsListener((msg) => {
          void handleSms(msg.body ?? '');
        });
        removeSub = () => sub.remove();
      } catch {
        // Module missing in Expo Go or unsupported platform: no-op
      }
    })();

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drainQueue();
    });

    return () => {
      cancelled = true;
      removeSub?.();
      appSub.remove();
      if (mod) {
        void mod.stopSmsListenerServiceAsync().catch(() => undefined);
      }
    };
  }, [session?.user.id, activeWalletId, enabled, queryClient]);
}
