import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeProgress } from '@/lib/progress'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_progress')
    .select('progress, updated_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ progress: normalizeProgress(data?.progress), updatedAt: data?.updated_at ?? null })
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body.progress !== 'object') return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  if (JSON.stringify(body.progress).length > 1_500_000) return NextResponse.json({ error: 'Progress payload too large' }, { status: 413 })

  const progress = normalizeProgress(body.progress)
  const { error } = await supabase.from('user_progress').upsert({
    user_id: user.id,
    progress,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, progress })
}
