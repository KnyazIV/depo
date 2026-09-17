import type { Metadata, Viewport } from "next";
import { Golos_Text, Unbounded } from "next/font/google";

import { RailTrack } from "@/components/site/rail-track";
import { Toaster } from "@/components/ui/sonner";
import { site, siteUrl } from "@/lib/site";

import "./globals.css";

/** Заголовки и логотип. Больше нигде не используется — это акцент, а не рабочая гарнитура. */
const unbounded = Unbounded({
  subsets: ["cyrillic", "latin"],
  variable: "--font-unbounded",
  display: "swap",
});

/** Весь остальной текст: интерфейсный гротеск с честной кириллицей. */
const golos = Golos_Text({
  subsets: ["cyrillic", "latin"],
  variable: "--font-golos",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: site.name,
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#e4e2dd",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${golos.variable} ${unbounded.variable}`}>
      <body className="min-h-dvh antialiased">
        <RailTrack />
        {/* Содержимое едет поверх путей: без явного слоя fixed-полоса
            перекрыла бы его, а отрицательный z-index спрятал бы её под
            заливку body. */}
        <div className="relative z-10">{children}</div>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
