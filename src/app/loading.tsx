import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-grow pb-16">
        {/* Hero Section Skeleton */}
        <div className="relative bg-muted py-24 sm:py-32 overflow-hidden">
          <div className="container mx-auto px-4 relative z-10 text-center">
            <Skeleton className="h-16 w-3/4 max-w-3xl mx-auto mb-6" />
            <Skeleton className="h-6 w-1/2 max-w-xl mx-auto mb-10" />
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Skeleton className="h-12 w-40 rounded-md" />
              <Skeleton className="h-12 w-40 rounded-md" />
            </div>
          </div>
        </div>

        {/* Categories Section Skeleton */}
        <section className="container mx-auto px-4 py-16">
          <div className="flex justify-between items-end mb-8">
            <Skeleton className="h-10 w-64" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        </section>

        {/* Products Section Skeleton */}
        <section className="container mx-auto px-4 py-16 bg-muted/30">
          <div className="text-center mb-12">
            <Skeleton className="h-10 w-64 mx-auto mb-4" />
            <Skeleton className="h-5 w-96 mx-auto" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="flex flex-col gap-4">
                <Skeleton className="h-64 w-full rounded-xl" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/4" />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
