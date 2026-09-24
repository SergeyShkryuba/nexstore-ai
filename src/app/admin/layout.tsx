import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AdminNav } from '@/components/admin/AdminNav'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    redirect('/')
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-muted/40">
      <aside className="w-64 shrink-0 bg-background border-r hidden md:block">
        <div className="p-6">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back to store
          </Link>
          <h2 className="text-xl font-bold tracking-tight mb-6">Admin panel</h2>
          <AdminNav orientation="vertical" />
        </div>
      </aside>

      {/* Small screens: the sidebar collapses into a row of tabs. */}
      <div className="border-b bg-background px-4 py-2 md:hidden">
        <AdminNav orientation="horizontal" />
      </div>

      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-4 sm:p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
