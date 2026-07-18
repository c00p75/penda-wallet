import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Redirect } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Text, Button, Input, Screen } from '@/src/components/ui';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { colors, radius, shadows, spacing } from '@/src/lib/theme';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/store/authStore';

const redirectTo = makeRedirectUri({ scheme: 'penda' });

function Sparkle({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 0c.9 6.6 4.5 10.2 12 12-7.5 1.8-11.1 5.4-12 12-.9-6.6-4.5-10.2-12-12 7.5-1.8 11.1-5.4 12-12Z"
        fill={color}
      />
    </Svg>
  );
}

export default function LoginScreen() {
  const session = useAuthStore((s) => s.session);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  if (session) return <Redirect href="/" />;

  async function handleMagicLink() {
    if (!email.trim()) return;
    setStatus('sending');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      setErrorMessage(error.message);
      setStatus('error');
    } else {
      setStatus('sent');
    }
  }

  async function handleGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) {
      setErrorMessage(error.message);
      setStatus('error');
      return;
    }
    if (data?.url) {
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success' && result.url) {
        const hashIndex = result.url.indexOf('#');
        const queryString = hashIndex >= 0 ? result.url.slice(hashIndex + 1) : result.url.split('?')[1] ?? '';
        const params = new URLSearchParams(queryString);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
        }
      }
    }
  }

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <LinearGradient
            colors={[colors.heroStart, colors.heroMid, colors.heroEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroTop}>
              <Text variant="label" color={colors.textSecondary}>
                Penda
              </Text>
              <Sparkle size={14} color={colors.iris} />
            </View>
            <Sparkle size={48} color={colors.iris} />
            <Text variant="hero" style={styles.headline}>
              Your money,{'\n'}finally{'\n'}understood.
            </Text>
            <Text variant="body" color={colors.textSecondary} style={styles.subtitle}>
              Meet Penda, your private AI money companion.
            </Text>
          </LinearGradient>

          <View style={styles.form}>
            <AnimatedPressable onPress={() => void handleGoogle()} style={styles.googleBtn}>
              <Text variant="bodyMedium">Continue with Google</Text>
            </AnimatedPressable>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text variant="caption" color={colors.textMuted}>
                or continue with email
              </Text>
              <View style={styles.dividerLine} />
            </View>

            {status === 'sent' ? (
              <View style={styles.sentBox}>
                <Text variant="body" color={colors.textSecondary}>
                  Check <Text variant="bodyMedium">{email}</Text> for a sign-in link.
                </Text>
              </View>
            ) : (
              <>
                <Text variant="caption" color={colors.textMuted}>
                  Email address
                </Text>
                <Input
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  style={styles.input}
                />
                {status === 'error' ? (
                  <Text variant="caption" color={colors.rose}>
                    {errorMessage}
                  </Text>
                ) : null}
                <Button
                  title={status === 'sending' ? 'Sending link…' : 'Send magic link'}
                  onPress={() => void handleMagicLink()}
                  loading={status === 'sending'}
                  style={styles.submit}
                />
              </>
            )}

            <Text variant="caption" color={colors.textMuted} style={styles.terms}>
              By continuing, you agree to Penda&apos;s Terms of Service and Privacy Policy.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: spacing.xl,
    gap: spacing.xl,
  },
  hero: {
    borderRadius: radius.xl,
    padding: spacing.xxl,
    minHeight: 280,
    ...shadows.medium,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  headline: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  subtitle: {
    maxWidth: 260,
  },
  form: {
    gap: spacing.md,
  },
  googleBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  input: {
    marginTop: spacing.xs,
  },
  submit: {
    marginTop: spacing.sm,
  },
  sentBox: {
    backgroundColor: colors.mintSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: `${colors.mint}55`,
  },
  terms: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
