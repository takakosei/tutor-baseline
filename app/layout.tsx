import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { HTML_LANG } from "@/lib/i18n/locale";
import { common } from "@/lib/i18n/messages/common";
import { getVisitorLocale } from "@/lib/i18n/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Title and <html lang> follow the visitor's language (cookie / browser). Teacher and parent pages add their own lang layer inside (LocaleProvider)
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: common[await getVisitorLocale()].appName,
    // The whole site is private: the teacher side needs sign-in and the parent side relies on unguessable links, so search engines shouldn't index it
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang={HTML_LANG[await getVisitorLocale()]}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Browser extensions such as Grammarly add attributes to body, causing hydration mismatch warnings in development.
          suppressHydrationWarning only covers body's own attributes and doesn't hide real problems in the subtree */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
