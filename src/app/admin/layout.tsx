import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, Package, ShoppingCart, Users, ArrowLeft } from 'lucide-react'

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
    <div className="flex min-h-screen bg-muted/40">
      {/* Admin Sidebar */}
      <aside className="w-64 bg-background border-r hidden md:block">
        <div className="p-6">
          <Link href="/" className="flex items-center space-x-2 text-muted-foreground hover:text-foreground mb-8">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Store</span>
          </Link>
          <h2 className="text-xl font-bold tracking-tight mb-6">Admin Panel</h2>
          <nav className="space-y-2">
            <Link 
              href="/admin" 
              className="flex items-center space-x-2 px-3 py-2 rounded-md hover:bg-muted transition-colors"
            >
              <LayoutDashboard className="w-5 h-5" />
              <span>Overview</span>
            </Link>
            <Link 
              href="/admin/products" 
              className="flex items-center space-x-2 px-3 py-2 rounded-md hover:bg-muted transition-colors"
            >
              <Package className="w-5 h-5" />
              <span>Products</span>
            </Link>
            <Link 
              href="/admin" 
              className="flex items-center space-x-2 px-3 py-2 rounded-md hover:bg-muted transition-colors text-muted-foreground opacity-50 cursor-not-allowed"
            >
              <ShoppingCart className="w-5 h-5" />
              <span>Orders (Coming Soon)</span>
            </Link>
            <Link 
              href="/admin" 
              className="flex items-center space-x-2 px-3 py-2 rounded-md hover:bg-muted transition-colors text-muted-foreground opacity-50 cursor-not-allowed"
            >
              <Users className="w-5 h-5" />
              <span>Users (Coming Soon)</span>
            </Link>
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
