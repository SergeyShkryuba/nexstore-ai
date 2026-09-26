/**
 * The real root layout, with <html lang>, is `app/[locale]/layout.tsx`: the
 * language is only known below the [locale] segment. This one exists for the
 * few routes outside it (`app/not-found.tsx`) and passes children through.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children
}
