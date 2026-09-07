import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <p className="mb-3 font-mono text-xs text-primary">404</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mb-6 mt-3 text-sm text-muted-foreground">
        This page may have moved. Return to your workspace to continue.
      </p>
      <Button asChild>
        <Link href="/">
          <ArrowLeft className="size-4" />
          Back to overview
        </Link>
      </Button>
    </div>
  );
}
