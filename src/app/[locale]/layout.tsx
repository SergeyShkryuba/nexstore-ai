import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "../globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { loadNavCategories } from "@/lib/nav-categories";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster } from 'sonner';
import { LOCALES, OG_LOCALE, isLocale } from "@/i18n/routing";
import { alternates } from "@/lib/seo";

import { siteUrl } from "@/lib/site";

type Props = { params: Promise<{ locale: string }> };

/** Every page is prerendered once per language. */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    // Required for relative OG/Twitter image URLs to resolve to absolute ones.
    metadataBase: new URL(siteUrl),
    title: {
      template: "%s | NexStore AI",
      default: t("title"),
    },
    description: t("description"),
    alternates: alternates("/", locale),
    openGraph: {
      type: "website",
      locale: OG_LOCALE[locale],
      url: siteUrl,
      title: t("title"),
      description: t("tagline"),
      siteName: "NexStore AI",
    },
    twitter: {
      card: "summary_large_image",
      title: "NexStore AI",
      description: t("tagline"),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
}> & Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // Lets pages below render statically: the locale comes from the URL, not
  // from request headers.
  setRequestLocale(locale);

  // Header and footer both list the categories; one query serves both.
  const [categories, t] = await Promise.all([
    loadNavCategories(locale),
    getTranslations({ locale, namespace: "Layout" }),
  ]);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="antialiased min-h-screen flex flex-col font-sans"
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:ring-2 focus:ring-ring"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <Header categories={categories} />
            <main id="main-content" className="flex-1">{children}</main>
            <Footer categories={categories} />
            <Toaster />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
