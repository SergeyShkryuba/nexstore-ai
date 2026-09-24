import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster } from 'sonner';

import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  // Required for relative OG/Twitter image URLs to resolve to absolute ones.
  metadataBase: new URL(siteUrl),
  title: {
    template: "%s | NexStore AI",
    default: "NexStore AI - Next Generation E-commerce",
  },
  description:
    "A full-stack Next.js storefront: catalogue search, cart, Stripe checkout and an admin panel.",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    title: "NexStore AI - Next Generation E-commerce",
    description: "Experience the future of shopping with our AI-powered e-commerce platform.",
    siteName: "NexStore AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "NexStore AI",
    description: "Experience the future of shopping with our AI-powered e-commerce platform.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="antialiased min-h-screen flex flex-col font-sans"
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:ring-2 focus:ring-ring"
        >
          Skip to content
        </a>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Header />
          <main id="main-content" className="flex-1">{children}</main>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
