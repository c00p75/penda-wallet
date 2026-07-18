import { AppRegistry } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Closed-app SMS capture (Android). Queues MoMo-like bodies for the next foreground ingest.
AppRegistry.registerHeadlessTask('ExpoSmsListenerBackground', () => async (data) => {
  try {
    const body = typeof data?.body === 'string' ? data.body : '';
    if (!body.trim()) return;
    const raw = await AsyncStorage.getItem('penda-sms-queue');
    const queue = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(queue) ? queue : [];
    next.push({ body, at: Date.now() });
    await AsyncStorage.setItem('penda-sms-queue', JSON.stringify(next.slice(-50)));
  } catch {
    // best-effort
  }
});

import 'expo-router/entry';
