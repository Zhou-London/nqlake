import { MarketOverview } from "@/components/market-overview";
import { MarketWorkspace } from "@/components/market-workspace";

type MarketPage = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function MarketPage({ searchParams }: MarketPage) {
  const params = await searchParams;
  return typeof params.symbol === "string" ? (
    <MarketWorkspace key={params.symbol} symbol={params.symbol} />
  ) : (
    <MarketOverview />
  );
}
