import { createClient } from '@/utils/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { SupportStatusButton } from '@/components/admin/SupportStatusButton'
import { LOCALE_NAMES, isLocale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

type SupportRequest = {
  id: string
  created_at: string
  email: string
  message: string
  summary: string | null
  transcript: Array<{ role: 'user' | 'assistant'; content: string }>
  locale: string
  status: 'open' | 'resolved'
}

const dateFormatter = new Intl.DateTimeFormat('en-IE', { dateStyle: 'medium', timeStyle: 'short' })

export default async function AdminSupportPage() {
  const supabase = await createClient()

  // Admins read every request through the RLS policy on `support_requests`.
  const { data, error } = await supabase
    .from('support_requests')
    .select('id, created_at, email, message, summary, transcript, locale, status')
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(200)

  const requests = (data ?? []) as SupportRequest[]
  const open = requests.filter((r) => r.status === 'open').length

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Support</h1>
        <p className="text-muted-foreground mt-2">
          Requests shoppers sent from the shop assistant&apos;s &ldquo;talk to a person&rdquo; form. Open first, newest
          first. Reply by email.
        </p>
      </div>

      {error && <p className="text-destructive">Could not load requests: {error.message}</p>}

      {!error && requests.length === 0 && <p className="text-muted-foreground">No requests yet.</p>}

      {requests.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {open} open · {requests.length - open} resolved
        </p>
      )}

      <div className="space-y-4">
        {requests.map((request) => (
          <Card key={request.id} className={cn(request.status === 'resolved' && 'opacity-60')}>
            <CardContent className="space-y-3 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <a href={`mailto:${request.email}`} className="font-medium hover:underline">
                    {request.email}
                  </a>
                  <p className="text-xs text-muted-foreground">
                    {dateFormatter.format(new Date(request.created_at))} ·{' '}
                    {isLocale(request.locale) ? LOCALE_NAMES[request.locale] : request.locale}
                  </p>
                </div>
                <SupportStatusButton requestId={request.id} status={request.status} />
              </div>

              {request.summary && (
                <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                  <span className="font-medium">Assistant&apos;s summary: </span>
                  {request.summary}
                </p>
              )}

              <p className="whitespace-pre-wrap text-sm">{request.message}</p>

              {request.transcript.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    Chat transcript ({request.transcript.length} messages)
                  </summary>
                  <ol className="mt-3 space-y-2 border-l pl-4">
                    {request.transcript.map((line, i) => (
                      <li key={i}>
                        <span className="font-medium">{line.role === 'user' ? 'Shopper' : 'Assistant'}: </span>
                        <span className="whitespace-pre-wrap text-muted-foreground">{line.content}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
