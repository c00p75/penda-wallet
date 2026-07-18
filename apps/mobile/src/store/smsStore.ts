import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface SmsState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useSmsStore = create<SmsState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: 'penda-sms-ingest',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
