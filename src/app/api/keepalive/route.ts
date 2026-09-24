import { NextResponse } from 'next/server'
import { createPublicClient } from '@/utils/supabase/public'
import { createServiceClient } from '@/utils/supabase/service'

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

  // Safety net for stock reservations whose Stripe "expired" event never
  // arrived. Only ever releases reservations past their expiry, so it is
  // harmless even if the route were called by someone else.
  let released: number | null = null
  const service = createServiceClient()
  if (service) {
    const { data, error: releaseError } = await service.rpc('release_expired_reservations')
    if (releaseError) console.error('Keep-alive: releasing expired reservations failed', releaseError)
    else released = data as number
  }

  return NextResponse.json({ ok: true, categories: count, released, at: new Date().toISOString() })
}
