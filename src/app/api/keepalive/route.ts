import { NextResponse } from 'next/server'
import { createPublicClient } from '@/utils/supabase/public'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Hit once a day by Vercel Cron (see `vercel.json`).
 *
 * A free-tier Supabase project is paused after about a week without activity,
 * and a project paused for 90 days cannot be restored — that is how the first
 * database behind this app was lost. One cheap read a day counts as activity.
 *
 * When `CRON_SECRET` is set, Vercel sends it as a bearer token and any other
 * caller is rejected, so the route cannot be used to generate load.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { count, error } = await createPublicClient()
    .from('categories')
    .select('id', { count: 'exact', head: true })

  if (error) {
    // The database's own message stays in the log; callers only learn it failed.
    console.error('Keep-alive: database read failed', error)
    return NextResponse.json({ ok: false }, { status: 502 })
  }

  return NextResponse.json({ ok: true, categories: count, at: new Date().toISOString() })
}
