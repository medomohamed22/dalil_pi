import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dalil Pi — AI shopping agent for Pi",
  description:
    "Tell Dalil Pi what you need. It searches stores that accept Pi in your country, checks how trustworthy each store is, and shows ratings and reviews.",
  applicationName: "Dalil Pi",
  manifest: "/manifest.webmanifest",
  verification: {
    google: "uK-AN23ynGlpUOs2LoZ-xU3t97DTlawaUKpuJOT_UjA",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

// Apply the saved theme before paint to avoid a flash.
const boot = `try{var t=localStorage.getItem('dalil-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: boot }} />
      </head>
      <body className={`${inter.variable} ${arabic.variable}`}>
        {children}
        {/* Real-device speed + page views (free Hobby allowance; inactive until enabled in the Vercel dashboard). */}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
