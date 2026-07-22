import { useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { transcribeVoice } from '@/src/api/chat';

export type VoiceRecorderState = 'idle' | 'recording' | 'transcribing';

export const MIN_RECORD_MS = 400;
export const MAX_RECORD_MS = 60_000;

export interface VoiceStopResult {
  transcript: string;
  discarded: boolean;
}

interface VoiceRecorderOptions {
  currency?: string;
  onError: (message: string) => void;
  onLevel?: (level: number) => void;
}

type Lifecycle = 'idle' | 'starting' | 'recording' | 'transcribing';

function meteringToLevel(metering: number | undefined): number {
  if (metering == null || Number.isNaN(metering)) return 0;
  // expo-av metering is roughly -160..0 dB; map a usable speech band to 0..1.
  return Math.min(1, Math.max(0, (metering + 55) / 55));
}

export function useVoiceRecorder({ currency, onError, onLevel }: VoiceRecorderOptions) {
  const [state, setState] = useState<VoiceRecorderState>('idle');
  const [level, setLevel] = useState(0);

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onLevelRef = useRef(onLevel);
  onLevelRef.current = onLevel;
  const currencyRef = useRef(currency);
  currencyRef.current = currency;

  const lifecycleRef = useRef<Lifecycle>('idle');
  const recordingRef = useRef<Audio.Recording | null>(null);
  const generationRef = useRef(0);
  const startedAtRef = useRef(0);
  const discardRequestedRef = useRef(false);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcribeGenRef = useRef(0);
  const stopRef = useRef<() => Promise<VoiceStopResult>>(async () => ({
    transcript: '',
    discarded: true,
  }));

  function publishLevel(next: number) {
    setLevel(next);
    onLevelRef.current?.(next);
  }

  function clearMaxTimer() {
    if (maxTimerRef.current != null) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }

  async function unloadRecording() {
    const rec = recordingRef.current;
    recordingRef.current = null;
    clearMaxTimer();
    publishLevel(0);
    if (!rec) return;
    try {
      rec.setOnRecordingStatusUpdate(null);
      await rec.stopAndUnloadAsync();
    } catch {
      /* already unloaded */
    }
  }

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      void unloadRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    if (lifecycleRef.current !== 'idle') {
      if (startPromiseRef.current) await startPromiseRef.current.catch(() => undefined);
      return;
    }

    const generation = ++generationRef.current;
    discardRequestedRef.current = false;
    lifecycleRef.current = 'starting';

    const run = (async () => {
      try {
        const permission = await Audio.requestPermissionsAsync();
        if (!permission.granted) {
          lifecycleRef.current = 'idle';
          onErrorRef.current('Enable microphone access in Settings, then try again.');
          throw new Error('mic-denied');
        }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync({
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        });
        recording.setOnRecordingStatusUpdate((status) => {
          if (!status.isRecording) return;
          publishLevel(meteringToLevel(status.metering));
        });
        await recording.startAsync();

        if (generation !== generationRef.current || discardRequestedRef.current) {
          try {
            await recording.stopAndUnloadAsync();
          } catch {
            /* ignore */
          }
          lifecycleRef.current = 'idle';
          setState('idle');
          return;
        }

        recordingRef.current = recording;
        startedAtRef.current = Date.now();
        lifecycleRef.current = 'recording';
        setState('recording');

        clearMaxTimer();
        maxTimerRef.current = setTimeout(() => {
          if (generation === generationRef.current && lifecycleRef.current === 'recording') {
            void stopRef.current();
          }
        }, MAX_RECORD_MS);
      } catch (error) {
        lifecycleRef.current = 'idle';
        setState('idle');
        if (!(error instanceof Error && error.message === 'mic-denied')) {
          onErrorRef.current(error instanceof Error ? error.message : 'Could not start recording.');
        }
        throw error;
      }
    })();

    startPromiseRef.current = run.finally(() => {
      if (startPromiseRef.current === run) startPromiseRef.current = null;
    });
    await startPromiseRef.current;
  }

  async function stop(): Promise<VoiceStopResult> {
    if (lifecycleRef.current === 'starting' || startPromiseRef.current) {
      await startPromiseRef.current?.catch(() => undefined);
      if (discardRequestedRef.current || lifecycleRef.current === 'idle') {
        return { transcript: '', discarded: true };
      }
    }

    const rec = recordingRef.current;
    if (!rec || lifecycleRef.current !== 'recording') {
      if (lifecycleRef.current !== 'transcribing') {
        lifecycleRef.current = 'idle';
        setState('idle');
      }
      return { transcript: '', discarded: true };
    }

    const generation = generationRef.current;
    const elapsed = Date.now() - startedAtRef.current;
    clearMaxTimer();
    recordingRef.current = null;
    publishLevel(0);

    let uri: string | null = null;
    try {
      await rec.stopAndUnloadAsync();
      uri = rec.getURI();
    } catch {
      lifecycleRef.current = 'idle';
      setState('idle');
      return { transcript: '', discarded: true };
    }

    if (
      discardRequestedRef.current ||
      generation !== generationRef.current ||
      elapsed < MIN_RECORD_MS ||
      !uri
    ) {
      if (
        !discardRequestedRef.current &&
        generation === generationRef.current &&
        elapsed < MIN_RECORD_MS
      ) {
        onErrorRef.current('Hold a bit longer, then release to send.');
      }
      discardRequestedRef.current = false;
      lifecycleRef.current = 'idle';
      setState('idle');
      return { transcript: '', discarded: true };
    }

    const transcribeGen = ++transcribeGenRef.current;
    lifecycleRef.current = 'transcribing';
    setState('transcribing');
    try {
      const transcript = await transcribeVoice(uri, 'voice.m4a', {
        currency: currencyRef.current,
      });
      if (transcribeGen !== transcribeGenRef.current || generation !== generationRef.current) {
        return { transcript: '', discarded: true };
      }
      lifecycleRef.current = 'idle';
      setState('idle');
      discardRequestedRef.current = false;
      return { transcript: transcript.trim(), discarded: false };
    } catch (error) {
      if (transcribeGen !== transcribeGenRef.current) {
        return { transcript: '', discarded: true };
      }
      const message = error instanceof Error ? error.message : 'Transcription failed';
      const rateLimited = /rate|limit|too many|try again later/i.test(message);
      onErrorRef.current(
        rateLimited ? 'Voice is busy right now. Wait a moment and try again.' : message,
      );
      lifecycleRef.current = 'idle';
      setState('idle');
      discardRequestedRef.current = false;
      return { transcript: '', discarded: true };
    }
  }

  stopRef.current = stop;

  async function discard(): Promise<void> {
    discardRequestedRef.current = true;
    generationRef.current += 1;
    transcribeGenRef.current += 1;
    if (startPromiseRef.current) {
      await startPromiseRef.current.catch(() => undefined);
    }
    await unloadRecording();
    lifecycleRef.current = 'idle';
    setState('idle');
    discardRequestedRef.current = false;
  }

  return { state, level, start, stop, discard };
}
