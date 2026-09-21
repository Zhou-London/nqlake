"use client";
import { Button, EmptyState, PageContent } from "@nowquant/nqui";
import { AlertTriangle } from "lucide-react";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <PageContent>
      <EmptyState
        size="lg"
        icon={<AlertTriangle />}
        title="Unable to load this page"
        description="Try again. If the problem persists, check the data service connection."
        actions={
          <Button color="primary" onPress={reset}>
            Try again
          </Button>
        }
      />
    </PageContent>
  );
}
