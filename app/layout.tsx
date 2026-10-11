import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
});

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "Merchant Ops Resolver: failed settlements fixed, verified and closed";
const description =
  "An autonomous multi-agent system that investigates, fixes, verifies and documents merchant operations issues end to end. Traced with neatlogs, checkpointed with Entire, priced with cfo.ai.";

export const metadata: Metadata = {
  // Set NEXT_PUBLIC_SITE_URL to the deployed address so share links point at the right place.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title,
  description,
  openGraph: { title, description, siteName: "Merchant Ops Resolver", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-tone="fault"
      suppressHydrationWarning
      className={`${bricolage.variable} ${geist.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-svh font-sans">
        <noscript>
          <style>{".pre-hidden{visibility:visible}.preloader{display:none}"}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}
