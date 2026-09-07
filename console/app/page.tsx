import { CatalogSummary } from "@/components/console/catalog-summary";
import { PageHeader } from "@/components/console/page-header";
import { StatusPanel } from "@/components/console/status-panel";

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description="Health of the stack and a map of the catalog."
      />
      <div className="flex flex-col gap-8 px-6 pb-8">
        <StatusPanel />
        <CatalogSummary />
      </div>
    </>
  );
}
