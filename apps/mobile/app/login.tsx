import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
const MIN_PASSWORD_LENGTH = 8;

type AuthMode = 'signin' | 'signup' | 'forgot';
type Status = 'idle' | 'loading' | 'sent' | 'error';

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

function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export default function LoginScreen() {
  const session = useAuthStore((s) => s.session);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  if (session) return <Redirect href="/" />;

  function switchMode(next: AuthMode) {
    setMode(next);
    setStatus('idle');
    setErrorMessage('');
    setInfoMessage('');
    setPassword('');
    setConfirmPassword('');
  }

  async function handleSubmit() {
    setErrorMessage('');
    setInfoMessage('');
    setStatus('loading');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Enter your email address.');
      setStatus('error');
      return;
    }

    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo,
      });
      if (error) {
        setErrorMessage(error.message);
        setStatus('error');
        return;
      }
      setInfoMessage(`Password reset link sent to ${trimmedEmail}.`);
      setStatus('sent');
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setErrorMessage(passwordError);
      setStatus('error');
      return;
    }

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        setStatus('error');
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        setErrorMessage(error.message);
        setStatus('error');
        return;
      }
      if (!data.session) {
        setInfoMessage(`Check ${trimmedEmail} to confirm your account, then sign in.`);
        setStatus('sent');
        return;
      }
      setStatus('idle');
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });
    if (error) {
      setErrorMessage(error.message);
      setStatus('error');
      return;
    }
    setStatus('idle');
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

  const submitLabel =
    status === 'loading'
      ? mode === 'forgot'
        ? 'Sending…'
        : mode === 'signup'
          ? 'Creating account…'
          : 'Signing in…'
      : mode === 'forgot'
        ? 'Send reset link'
        : mode === 'signup'
          ? 'Create account'
          : 'Sign in';

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
            {mode !== 'forgot' ? (
              <AnimatedPressable onPress={() => void handleGoogle()} style={styles.googleBtn}>
                <Text variant="bodyMedium">Continue with Google</Text>
              </AnimatedPressable>
            ) : null}

            {mode !== 'forgot' ? (
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text variant="caption" color={colors.textMuted}>
                  or continue with email
                </Text>
                <View style={styles.dividerLine} />
              </View>
            ) : null}

            {status === 'sent' ? (
              <View style={styles.sentBox}>
                <Text variant="body" color={colors.textSecondary}>
                  {infoMessage}
                </Text>
                <Pressable onPress={() => switchMode('signin')} style={styles.linkWrap}>
                  <Text variant="caption" color={colors.text} style={styles.link}>
                    Back to sign in
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                {mode === 'forgot' ? (
                  <Text variant="body" color={colors.textSecondary}>
                    Enter your email and we&apos;ll send a link to reset your password.
                  </Text>
                ) : null}

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

                {mode !== 'forgot' ? (
                  <>
                    <View style={styles.passwordHeader}>
                      <Text variant="caption" color={colors.textMuted}>
                        Password
                      </Text>
                      {mode === 'signin' ? (
                        <Pressable onPress={() => switchMode('forgot')}>
                          <Text variant="caption" color={colors.textMuted} style={styles.link}>
                            Forgot password?
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <Input
                      value={password}
                      onChangeText={setPassword}
                      placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                      secureTextEntry
                      autoCapitalize="none"
                      autoComplete={mode === 'signup' ? 'new-password' : 'password'}
                      style={styles.input}
                    />
                  </>
                ) : null}

                {mode === 'signup' ? (
                  <>
                    <Text variant="caption" color={colors.textMuted}>
                      Confirm password
                    </Text>
                    <Input
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Re-enter password"
                      secureTextEntry
                      autoCapitalize="none"
                      autoComplete="new-password"
                      style={styles.input}
                    />
                  </>
                ) : null}

                {status === 'error' ? (
                  <Text variant="caption" color={colors.rose}>
                    {errorMessage}
                  </Text>
                ) : null}

                <Button
                  title={submitLabel}
                  onPress={() => void handleSubmit()}
                  loading={status === 'loading'}
                  style={styles.submit}
                />
              </>
            )}

            {status !== 'sent' ? (
              <View style={styles.modeSwitch}>
                {mode === 'signin' ? (
                  <Pressable onPress={() => switchMode('signup')}>
                    <Text variant="caption" color={colors.textMuted}>
                      Don&apos;t have an account?{' '}
                      <Text variant="caption" color={colors.text} style={styles.link}>
                        Sign up
                      </Text>
                    </Text>
                  </Pressable>
                ) : null}
                {mode === 'signup' ? (
                  <Pressable onPress={() => switchMode('signin')}>
                    <Text variant="caption" color={colors.textMuted}>
                      Already have an account?{' '}
                      <Text variant="caption" color={colors.text} style={styles.link}>
                        Sign in
                      </Text>
                    </Text>
                  </Pressable>
                ) : null}
                {mode === 'forgot' ? (
                  <Pressable onPress={() => switchMode('signin')}>
                    <Text variant="caption" color={colors.text} style={styles.link}>
                      Back to sign in
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

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
  passwordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
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
    gap: spacing.md,
  },
  linkWrap: {
    alignSelf: 'center',
  },
  link: {
    textDecorationLine: 'underline',
  },
  modeSwitch: {
    alignItems: 'center',
  },
  terms: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
