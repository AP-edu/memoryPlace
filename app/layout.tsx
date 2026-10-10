import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import SessionWrapper from "@/components/SessionWrapper";
import Navbar from "@/components/Navbar";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

// Fonts are committed (app/fonts, SIL OFL) instead of fetched from Google at
// build time: Google sometimes answers the build machine with
// fonts.gstatic.com/l/font?kit=...&skey=... URLs whose "&" breaks Turbopack's
// font import, which failed the Vercel build. Latin variable subsets, the
// same files next/font/google downloaded.

// Clean geometric sans in the spirit of Quizlet's Hurme.
const jakarta = localFont({
  src: "./fonts/PlusJakartaSans-latin.woff2",
  weight: "200 800",
  variable: "--font-jakarta",
  display: "swap",
});

// Classical serif for headings (ancient-Greece feel).
const cormorant = localFont({
  src: "./fonts/CormorantGaramond-latin.woff2",
  weight: "300 700",
  variable: "--font-serif",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

const geistMono = localFont({
  src: "./fonts/GeistMono-latin.woff2",
  weight: "100 900",
  variable: "--font-geist-mono",
  display: "swap",
});

// Absolute URLs for social cards / canonical links. NEXTAUTH_URL is the
// production origin; Vercel previews fall back to VERCEL_URL.
const siteUrl =
  process.env.NEXTAUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "MemoryPlace", template: "%s · MemoryPlace" },
  description: "Design memory palaces in 2D, walk them in 3D, and reinforce recall with spatial quizzes.",
  applicationName: "MemoryPlace",
  openGraph: {
    type: "website",
    siteName: "MemoryPlace",
    title: "MemoryPlace",
    description: "Design memory palaces in 2D, walk them in 3D, and reinforce recall with spatial quizzes.",
  },
  twitter: { card: "summary_large_image", title: "MemoryPlace" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // notch-safe on phones
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f8fd" },
    { media: "(prefers-color-scheme: dark)", color: "#060b1f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${cormorant.variable} ${geistMono.variable}`}
      // The pre-paint script sets class/data-theme on <html> before hydration.
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved theme before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <SessionWrapper>
          <Navbar />
          {children}
        </SessionWrapper>
      </body>
    </html>
  );
}
