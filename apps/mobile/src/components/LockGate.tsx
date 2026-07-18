import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, Input } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/lib/theme';
import { generateSalt, hashPin, verifyPin } from '@/src/lib/lockCrypto';
import { useLockStore } from '@/src/store/lockStore';

function PinPad({
  pin,
  onPinChange,
  onSubmit,
  error,
  busy,
}: {
  pin: string;
  onPinChange: (pin: string) => void;
  onSubmit: () => void;
  error: string | null;
  busy: boolean;
}) {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

  function handleDigit(d: string) {
    if (d === 'del') {
      onPinChange(pin.slice(0, -1));
      return;
    }
    if (!d || pin.length >= 6) return;
    onPinChange(pin + d);
  }

  useEffect(() => {
    if (pin.length >= 4) onSubmit();
  }, [pin, onSubmit]);

  return (
    <View style={styles.pinSection}>
      <View style={styles.pinDots}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={[styles.pinDot, i < pin.length && styles.pinDotFilled]} />
        ))}
      </View>
      {error ? (
        <Text variant="caption" color={colors.rose} style={styles.error}>
          {error}
        </Text>
      ) : null}
      <View style={styles.pad}>
        {digits.map((d, i) => (
          <Pressable
            key={`${d}-${i}`}
            style={[styles.padKey, !d && styles.padKeyEmpty]}
            onPress={() => d && handleDigit(d)}
            disabled={busy || !d}
          >
            {d === 'del' ? (
              <Ionicons name="backspace-outline" size={22} color={colors.text} />
            ) : d ? (
              <Text variant="h3">{d}</Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function UnlockModal() {
  const { pinSalt, pinHash, biometricEnabled, setUnlocked, prompting, dismissPrompt } = useLockStore();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bioTried = useRef(false);

  useEffect(() => {
    if (!prompting) {
      setPin('');
      setError(null);
      bioTried.current = false;
      return;
    }
    if (biometricEnabled && !bioTried.current) {
      bioTried.current = true;
      void attemptBiometric();
    }
  }, [prompting, biometricEnabled]);

  async function attemptBiometric() {
    setBusy(true);
    setError(null);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) {
        setError('Biometrics unavailable. Enter your PIN.');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Penda balances',
        cancelLabel: 'Use PIN',
      });
      if (result.success) setUnlocked(true);
      else if (result.error !== 'user_cancel') setError('Biometric unlock failed. Enter your PIN.');
    } finally {
      setBusy(false);
    }
  }

  async function submitPin() {
    if (!pinSalt || !pinHash || pin.length < 4) return;
    setBusy(true);
    const ok = await verifyPin(pin, pinSalt, pinHash);
    setBusy(false);
    if (ok) {
      setUnlocked(true);
    } else {
      setError('Wrong PIN.');
      setPin('');
    }
  }

  return (
    <Modal visible={prompting} animationType="slide" transparent onRequestClose={dismissPrompt}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text variant="h2">Reveal balances</Text>
            <Pressable onPress={dismissPrompt}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Text variant="body" color={colors.textSecondary} style={styles.subtitle}>
            Your balances are hidden. Unlock to show them.
          </Text>
          {biometricEnabled ? (
            <Button
              title="Unlock with biometrics"
              variant="secondary"
              onPress={() => void attemptBiometric()}
              disabled={busy}
              style={styles.bioBtn}
            />
          ) : null}
          <PinPad
            pin={pin}
            onPinChange={(p) => {
              setPin(p);
              setError(null);
            }}
            onSubmit={() => void submitPin()}
            error={error}
            busy={busy}
          />
        </View>
      </View>
    </Modal>
  );
}

export function SetupLockModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const enable = useLockStore((s) => s.enable);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [useBio, setUseBio] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPin('');
    setConfirm('');
    setError(null);
    void LocalAuthentication.hasHardwareAsync().then(async (has) => {
      const enrolled = has ? await LocalAuthentication.isEnrolledAsync() : false;
      setBioAvailable(has && enrolled);
      setUseBio(has && enrolled);
    });
  }, [visible]);

  async function save() {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits.');
      return;
    }
    if (pin !== confirm) {
      setError('PINs do not match.');
      return;
    }
    setBusy(true);
    try {
      const pinSalt = generateSalt();
      const pinHash = await hashPin(pin, pinSalt);
      enable({ pinSalt, pinHash, biometricEnabled: useBio && bioAvailable });
      Alert.alert('Balance lock on', 'Tap a hidden balance to reveal it.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text variant="h2">Set up balance lock</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Text variant="body" color={colors.textSecondary} style={styles.subtitle}>
            Pick a PIN to reveal your balances. It stays on this device only.
          </Text>
          <View style={styles.field}>
            <Text variant="label" color={colors.textSecondary}>
              PIN (4-6 digits)
            </Text>
            <Input
              value={pin}
              onChangeText={(v) => {
                setPin(v.replace(/\D/g, '').slice(0, 6));
                setError(null);
              }}
              keyboardType="number-pad"
              secureTextEntry
              placeholder="Enter PIN"
            />
          </View>
          <View style={styles.field}>
            <Text variant="label" color={colors.textSecondary}>
              Confirm PIN
            </Text>
            <Input
              value={confirm}
              onChangeText={(v) => {
                setConfirm(v.replace(/\D/g, '').slice(0, 6));
                setError(null);
              }}
              keyboardType="number-pad"
              secureTextEntry
              placeholder="Confirm PIN"
            />
          </View>
          {bioAvailable ? (
            <Pressable style={styles.bioRow} onPress={() => setUseBio(!useBio)}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">Also use biometrics</Text>
                <Text variant="caption" color={colors.textMuted}>
                  Face ID or fingerprint, with PIN as backup.
                </Text>
              </View>
              <Ionicons
                name={useBio ? 'checkbox' : 'square-outline'}
                size={22}
                color={useBio ? colors.iris : colors.textMuted}
              />
            </Pressable>
          ) : null}
          {error ? (
            <Text variant="caption" color={colors.rose}>
              {error}
            </Text>
          ) : null}
          <Button title="Turn on balance lock" onPress={() => void save()} loading={busy} />
        </View>
      </View>
    </Modal>
  );
}

export function LockGate() {
  return <UnlockModal />;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? spacing.xxxl : spacing.xl,
    gap: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subtitle: {
    marginBottom: spacing.sm,
  },
  bioBtn: {
    marginBottom: spacing.sm,
  },
  pinSection: {
    alignItems: 'center',
    gap: spacing.md,
  },
  pinDots: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  pinDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pinDotFilled: {
    backgroundColor: colors.iris,
    borderColor: colors.iris,
  },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 280,
    justifyContent: 'center',
  },
  padKey: {
    width: 80,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    margin: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  padKeyEmpty: {
    backgroundColor: 'transparent',
  },
  error: {
    textAlign: 'center',
  },
  field: {
    gap: spacing.sm,
  },
  bioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.irisSoft,
  },
});
