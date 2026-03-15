import type { Metadata } from "next";

import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/config";

import "./globals.css";

export const metadata: Metadata = {
  title: `${APP_NAME} | Sui NFT Battle Game`,
  description: APP_DESCRIPTION,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ink text-white antialiased">
        <Providers>
          <div className="min-h-screen bg-battle-grid [background-size:24px_24px]">
            <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_15%_10%,rgba(39,211,162,0.22),transparent_35%),radial-gradient(circle_at_88%_0%,rgba(255,137,82,0.18),transparent_34%),radial-gradient(circle_at_50%_95%,rgba(78,132,255,0.18),transparent_35%)]" />
            <SiteHeader />
            <main className="mx-auto max-w-7xl px-4 pb-14 pt-8">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
