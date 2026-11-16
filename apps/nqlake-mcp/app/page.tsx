import { MarketOverview } from "@/components/market-overview";
import { MarketWorkspace } from "@/components/market-workspace";

type MarketPage = { searchParams: Promise<{ symbol?: string | string[] }> };

export default async function MarketPage({ searchParams }: MarketPage) {
  const { symbol } = await searchParams;
  return typeof symbol === "string" ? <MarketWorkspace key={symbol} symbol={symbol} /> : <MarketOverview />;
}
