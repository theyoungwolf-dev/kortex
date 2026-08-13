import "./globals.css";

import { Fraunces, IBM_Plex_Mono, Public_Sans } from "next/font/google";

import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Three families, three roles. Public Sans and Fraunces load as variable
 * fonts because the design uses off-step weights -- 420, 450, 550, 560, 650
 * in the sidebar depth taper -- which a static family would round away.
 */
const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const defaultUrl = process.env.APP_URL ? `https://${process.env.APP_URL}` : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: {
    default: "Kortex",
    template: "%s · Kortex",
  },
  description:
    "An open-source knowledge base. Collections of nested pages, ordered by hand, with publishing that respects hierarchy.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${publicSans.variable} ${fraunces.variable} ${ibmPlexMono.variable} font-sans`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
