import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { ConsoleShell } from "@/components/console-shell";
import { LakeProvider } from "@/components/lake-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Overview · NQ Lake", template: "%s · NQ Lake" },
  description: "NQ Lake Console · Explore, manage, and query your data",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-US">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        <LakeProvider>
          <ConsoleShell>{children}</ConsoleShell>
        </LakeProvider>
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
