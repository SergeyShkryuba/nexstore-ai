import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SearchSection } from "@/components/home/SearchSection";

export default function Home() {
  return (
    <div className="container mx-auto px-4 py-12">
      <SearchSection />

      <section className="py-20 mt-12 border-t">
        <h2 className="text-3xl font-bold mb-8 text-center">Popular Categories</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="hover:border-primary transition-colors">
            <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
              </div>
              <h3 className="text-xl font-semibold">Electronics</h3>
              <p className="text-sm text-muted-foreground">Smartphones, laptops, and gadgets.</p>
              <Link href="/categories/electronics" className={buttonVariants({ variant: "secondary", className: "w-full" })}>
                Browse
              </Link>
            </CardContent>
          </Card>
          
          <Card className="hover:border-primary transition-colors">
            <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.38 3.46 16 2a8.86 8.86 0 0 1-8 0l-4.38 1.46A2 2 0 0 0 2 5.35v12.3A2 2 0 0 0 3.62 19.5L8 21a8.86 8.86 0 0 0 8 0l4.38-1.46A2 2 0 0 0 22 17.65V5.35a2 2 0 0 0-1.62-1.89Z"/><path d="M16 2v19"/><path d="M8 2v19"/></svg>
              </div>
              <h3 className="text-xl font-semibold">Clothing</h3>
              <p className="text-sm text-muted-foreground">Stylish apparel for every season.</p>
              <Link href="/categories/clothing" className={buttonVariants({ variant: "secondary", className: "w-full" })}>
                Browse
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:border-primary transition-colors">
            <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </div>
              <h3 className="text-xl font-semibold">Smart Home</h3>
              <p className="text-sm text-muted-foreground">Home automation devices and sensors.</p>
              <Link href="/categories/smart-home" className={buttonVariants({ variant: "secondary", className: "w-full" })}>
                Browse
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
