import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const total = Number(body.total) || 0
  const score = Number(body.score) || 0
  const duration = Number(body.durationSeconds) || 0
  if (total < 0 || score < 0 || score > total || total > 500) {
    return NextResponse.json({ error: 'Invalid score' }, { status: 400 })
  }

  const { error } = await supabase.from('study_sessions').insert({
    user_id: user.id,
    mode: String(body.mode || 'practice').slice(0, 40),
    subject: body.subject ? String(body.subject).slice(0, 120) : null,
    score,
    total,
    duration_seconds: Math.max(0, Math.min(duration, 86400)),
    answers: Array.isArray(body.answers) ? body.answers.slice(0, 500) : [],
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
