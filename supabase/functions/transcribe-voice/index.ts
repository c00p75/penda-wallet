import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!

const GROQ_WHISPER_MODEL = 'whisper-large-v3-turbo'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401)
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
      return jsonResponse({ error: 'Invalid or expired session' }, 401)
    }

    const { data: isPremium, error: entitlementError } = await supabase.rpc('is_premium', {
      p_user_id: user.id,
    })
    if (entitlementError) throw entitlementError
    if (!isPremium) {
      return jsonResponse(
        { error: 'premium_required', message: 'Voice entry is a Penda Premium feature.' },
        402,
      )
    }

    const incomingForm = await req.formData()
    const audio = incomingForm.get('audio')
    if (!(audio instanceof File)) {
      return jsonResponse({ error: 'audio file is required' }, 400)
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
      return jsonResponse({ error: `Groq transcription error ${res.status}: ${await res.text()}` }, 502)
    }

    const data = await res.json()
    return jsonResponse({ transcript: data.text ?? '' })
  } catch (error) {
    console.error(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
