import type { Metadata } from "next";
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
    <html lang="en-US" suppressHydrationWarning>
      <body>
        <LakeProvider>
          <ConsoleShell>{children}</ConsoleShell>
        </LakeProvider>
      </body>
    </html>
  );
}
