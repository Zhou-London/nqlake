"use client";
import { EmptyState, Link, PageContent, buttonStyles } from "@nowquant/nqui";
import { ArrowLeft, Compass } from "lucide-react";
export default function NotFound() {
  return (
    <PageContent>
      <EmptyState
        size="lg"
        icon={<Compass />}
        title="Page not found"
        description="This page may have moved. Return to your workspace to continue."
        actions={
          <Link
            href="/"
            className={buttonStyles({ variant: "solid", color: "primary" })}
          >
            <ArrowLeft />
            Back to overview
          </Link>
        }
      />
    </PageContent>
  );
}
