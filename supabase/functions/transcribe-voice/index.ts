import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeadersFor } from '../_shared/cors.ts'
import { checkRateLimits } from '../_shared/rateLimit.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!

const GROQ_WHISPER_MODEL = 'whisper-large-v3-turbo'

// Voice is free/ungated (below), so this is the only cost guard on it —
// looser than chat's since a single utterance is cheap, but still bounded.
const VOICE_RATE_LIMITS = {
  burst: { maxRequests: 30, windowMinutes: 5 },
  daily: { maxRequests: 300, windowMinutes: 60 * 24 },
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

    // Voice is the free hero (roadmap bet 9): the most demo-able interaction is
    // ungated. Depth (insights history, unlimited members, receipts) monetises
    // instead — so no entitlement check here. Rate limiting is the cost guard
    // an entitlement gate would otherwise have provided (audit finding).
    const limitMessage = await checkRateLimits(supabase, user.id, 'transcribe-voice', VOICE_RATE_LIMITS)
    if (limitMessage) {
      return respond({ error: limitMessage }, 429)
    }

    const incomingForm = await req.formData()
    const audio = incomingForm.get('audio')
    if (!(audio instanceof File)) {
      return respond({ error: 'audio file is required' }, 400)
    }

    const groqForm = new FormData()
    groqForm.append('file', audio, audio.name || 'audio.webm')
    groqForm.append('model', GROQ_WHISPER_MODEL)

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: groqForm,
    })

    if (!res.ok) {
      return respond({ error: `Groq transcription error ${res.status}: ${await res.text()}` }, 502)
    }

    const data = await res.json()
    return respond({ transcript: data.text ?? '' })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return respond({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

function jsonResponse(body: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
