"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <h1 className="text-xl font-semibold">Unable to load this page</h1>
      <p className="mb-6 mt-3 text-sm text-muted-foreground">
        Try again. If the problem persists, check the data service connection.
      </p>
      <Button onPress={reset}>Try again</Button>
    </div>
  );
}
