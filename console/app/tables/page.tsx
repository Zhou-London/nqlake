import type { Metadata } from "next";
import { Table2 } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

export const metadata: Metadata = { title: "Tables" };

export default function TablesPage() {
  return (
    <Empty className="m-6 hidden flex-1 border md:flex">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Table2 />
        </EmptyMedia>
        <EmptyTitle>Pick a table</EmptyTitle>
        <EmptyDescription>
          Choose one on the left, or press{" "}
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>{" "}
          to search.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
