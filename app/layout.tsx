import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import SessionWrapper from "@/components/SessionWrapper";
import Navbar from "@/components/Navbar";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

// Clean geometric sans in the spirit of Quizlet's Hurme.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

// Classical serif for headings (ancient-Greece feel).
const cormorant = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
