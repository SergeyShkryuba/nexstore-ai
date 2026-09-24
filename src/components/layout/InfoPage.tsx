/** Shared frame for the footer's text pages: readable measure, consistent type. */
export function InfoPage({
  title,
  intro,
  children,
}: {
  title: string
  intro?: string
  children: React.ReactNode
}) {
  return (
    <div className="container mx-auto px-4 py-12">
      <article className="mx-auto max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
        {intro && <p className="mt-4 text-lg text-muted-foreground">{intro}</p>}
        <div className="mt-10 space-y-8 leading-relaxed [&_a]:underline [&_a]:underline-offset-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3 [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_ul]:space-y-2">
          {children}
        </div>
      </article>
    </div>
  )
}

export const DEMO_NOTICE =
  'NexStore AI is a portfolio project. It does not sell or ship anything, and checkout runs in Stripe test mode, so no real payment is ever taken.'
