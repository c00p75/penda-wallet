import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { File, Paths } from 'expo-file-system';
import { synthesizeSpeech } from '@/src/api/chat';

/**
 * Speaks an assistant reply aloud, one persona voice per message. expo-av's
 * Sound can't reliably play base64 data URIs across both platforms, so the
 * synthesized audio is written to a cache file once and played from there.
 * Cached per message id for the life of the sheet, never persisted alongside
 * the chat store.
 */
export function useSpeechPlayback() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map()); // messageId -> file uri
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const stop = useCallback(async () => {
    const sound = soundRef.current;
    soundRef.current = null;
    setSpeakingId(null);
    if (sound) {
      try {
        await sound.stopAsync();
      } catch {
        /* already stopped/unloaded */
      }
      await sound.unloadAsync().catch(() => {});
    }
  }, []);

  const reset = useCallback(() => {
    void stop();
    cacheRef.current.forEach((uri) => {
      try {
        new File(uri).delete();
      } catch {
        /* already gone */
      }
    });
    cacheRef.current.clear();
  }, [stop]);

  /** Resolves once playback ends (or fails) so callers can sequence after it. */
  const speak = useCallback(
    async (messageId: string, text: string, personality: string): Promise<void> => {
      await stop();
      if (!text.trim()) return;

      let fileUri = cacheRef.current.get(messageId);
      if (!fileUri) {
        setLoadingId(messageId);
        try {
          const { audio, mimeType } = await synthesizeSpeech(text, personality);
          const ext = mimeType.includes('mpeg') ? 'mp3' : 'wav';
          const file = new File(Paths.cache, `penda-speech-${messageId}.${ext}`);
          file.write(audio, { encoding: 'base64' });
          fileUri = file.uri;
          cacheRef.current.set(messageId, fileUri);
        } catch (error) {
          console.error('Speech synthesis failed:', error instanceof Error ? error.message : error);
          return;
        } finally {
          setLoadingId((id) => (id === messageId ? null : id));
        }
      }

      // Recording leaves the session in record mode; flip back so playback
      // reliably comes out the speaker instead of staying silent.
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

      setSpeakingId(messageId);
      await new Promise<void>((resolve) => {
        Audio.Sound.createAsync({ uri: fileUri! }, { shouldPlay: true }, (status) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish) resolve();
        })
          .then(({ sound }) => {
            soundRef.current = sound;
          })
          .catch(() => resolve());
      });
      setSpeakingId((id) => (id === messageId ? null : id));
    },
    [stop],
  );

  useEffect(() => () => reset(), [reset]);

  return { speak, stop, reset, speakingId, loadingId };
}
