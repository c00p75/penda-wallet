import { createClient } from 'npm:@supabase/supabase-js@2'
import { GoogleGenAI, Modality } from 'npm:@google/genai@2.11.0'
import type { Database } from '../_shared/database.types.ts'
import { corsHeadersFor } from '../_shared/cors.ts'
import { checkRateLimits } from '../_shared/rateLimit.ts'
import { PERSONALITY_VOICES, resolvePersonality } from '../_shared/personas.ts'
import { bytesToBase64, pcmToWavBase64 } from './wav.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY')

const GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview'
const GROQ_TTS_MODEL = 'canopylabs/orpheus-v1-english'
const ELEVENLABS_MODEL = 'eleven_multilingual_v2'

// Same free-hero philosophy as transcribe-voice (roadmap bet 9): ungated, but
// rate-limited since audio generation costs more than a text turn.
const SPEECH_RATE_LIMITS = {
  burst: { maxRequests: 20, windowMinutes: 5 },
  daily: { maxRequests: 150, windowMinutes: 60 * 24 },
}

// Keep replies speakable: caps latency/cost and avoids reading a multi-
// paragraph tool summary aloud. Cut at the last whitespace inside the limit
// rather than mid-word.
const MAX_TTS_CHARS = 500

function truncateForSpeech(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= MAX_TTS_CHARS) return trimmed
  const cut = trimmed.slice(0, MAX_TTS_CHARS)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim()
}

interface SpeechResult {
  audio: string
  mimeType: string
  provider: 'gemini' | 'groq' | 'elevenlabs'
}

async function synthesizeWithGemini(text: string, voiceName: string): Promise<SpeechResult> {
  const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  const response = await genAI.models.generateContent({
    model: GEMINI_TTS_MODEL,
    contents: [{ role: 'user', parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
  })

  const pcmBase64 = response.data
  if (!pcmBase64) throw new Error('Gemini TTS returned no audio data')

  return { audio: pcmToWavBase64(pcmBase64), mimeType: 'audio/wav', provider: 'gemini' }
}

async function synthesizeWithGroq(text: string, voice: string): Promise<SpeechResult> {
  const res = await fetch('https://api.groq.com/openai/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: GROQ_TTS_MODEL, input: text, voice, response_format: 'wav' }),
  })
  if (!res.ok) {
    throw new Error(`Groq TTS error ${res.status}: ${await res.text()}`)
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  return { audio: bytesToBase64(bytes), mimeType: 'audio/wav', provider: 'groq' }
}

async function synthesizeWithElevenLabs(text: string, voiceId: string): Promise<SpeechResult> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, model_id: ELEVENLABS_MODEL }),
  })
  if (!res.ok) {
    throw new Error(`ElevenLabs TTS error ${res.status}: ${await res.text()}`)
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  return { audio: bytesToBase64(bytes), mimeType: 'audio/mpeg', provider: 'elevenlabs' }
}

async function synthesizeSpeech(text: string, personality: string): Promise<SpeechResult> {
  const resolved = resolvePersonality(personality)
  const voices = PERSONALITY_VOICES[resolved] ?? PERSONALITY_VOICES.balanced_coach!

  try {
    return await synthesizeWithGemini(text, voices.gemini)
  } catch (error) {
    console.error('Gemini TTS failed, falling back to Groq:', error instanceof Error ? error.message : error)
  }

  try {
    return await synthesizeWithGroq(text, voices.groq)
  } catch (error) {
    console.error('Groq TTS failed:', error instanceof Error ? error.message : error)
  }

  if (ELEVENLABS_API_KEY) {
    return await synthesizeWithElevenLabs(text, voices.elevenlabs)
  }

  throw new Error('All speech providers failed')
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors })
  }
  const respond = (body: unknown, status = 200) => jsonResponse(body, cors, status)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return respond({ error: 'Missing Authorization header' }, 401)
    }

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return respond({ error: 'Invalid or expired session' }, 401)
    }

    const limitMessage = await checkRateLimits(supabase, user.id, 'synthesize-speech', SPEECH_RATE_LIMITS)
    if (limitMessage) {
      return respond({ error: limitMessage }, 429)
    }

    const body = await req.json().catch(() => null)
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    const personality = typeof body?.personality === 'string' ? body.personality : undefined

    if (!text) {
      return respond({ error: 'text is required' }, 400)
    }

    const result = await synthesizeSpeech(truncateForSpeech(text), personality ?? 'balanced_coach')
    return respond(result)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return respond({ error: 'Something went wrong on our side. Please try again.' }, 500)
  }
})

function jsonResponse(body: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
