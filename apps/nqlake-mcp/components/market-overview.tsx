"use client";

import { Alert, Card, CardBody, CardTitle, Chip, DeltaChip, EmptyState, PageContent, PriceText, Skeleton, Sparkline } from "@nowquant/nqui";
import { CandlestickChart } from "lucide-react";
import { STANCES } from "@/components/suggestion-panel";
import { type MarketEntry, marketHref, useMarketEntries } from "@/lib/market";
import type { Ohlcv } from "@/lib/ohlcv";
import type { SuggestionView } from "@/lib/suggestions";
import { useJson } from "@/lib/use-json";

const THUMBNAIL_BARS = 240;
const THUMBNAIL_HEIGHT = 56;

function MarketRow({ entry, suggestion }: { entry: MarketEntry; suggestion?: SuggestionView }) {
  const ohlcv = useJson<Ohlcv>(
    entry.priced ? `/api/ohlcv?symbol=${encodeURIComponent(entry.symbol)}&limit=${THUMBNAIL_BARS}` : null,
  );
  const closes = (ohlcv.data?.bars ?? []).map((bar) => bar[4]);
  const close = closes.at(-1);
  const previous = closes.at(-2);
  const stance = suggestion && STANCES[suggestion.stance];
  return (
    <Card href={marketHref(entry.symbol)}>
      <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex w-56 flex-col gap-1">
          <CardTitle>{entry.symbol}</CardTitle>
          <span className="truncate text-muted text-xs">{entry.tables.join(" · ")}</span>
        </div>
        <div className="flex w-40 items-center gap-2 tabular-nums">
          {close != null && <PriceText value={close} className="font-medium" />}
          {close != null && previous != null && <DeltaChip size="sm" value={close / previous - 1} />}
        </div>
        <div className="min-w-48 flex-1">
          {ohlcv.loading ? (
            <Skeleton style={{ height: THUMBNAIL_HEIGHT }} />
          ) : (
            closes.length > 1 && <Sparkline data={closes} width="100%" height={THUMBNAIL_HEIGHT} color="auto" area />
          )}
        </div>
        <div className="flex w-28 justify-end">
          {stance && (
            <Chip color={stance.color} startContent={stance.icon}>
              {stance.label}
            </Chip>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

export function MarketOverview() {
  const entries = useMarketEntries();
  const suggestions = useJson<SuggestionView[]>("/api/suggestions");
  return (
    <PageContent className="max-w-none! gap-3">
      {entries.error && <Alert color="warning" title={entries.error} />}
      {entries.loading && <Skeleton className="h-24" />}
      {entries.data?.map((entry) => (
        <MarketRow
          key={entry.symbol}
          entry={entry}
          suggestion={suggestions.data?.find((suggestion) => suggestion.symbol === entry.symbol)}
        />
      ))}
      {entries.data?.length === 0 && (
        <Card>
          <EmptyState icon={<CandlestickChart />} title="No symbols" />
        </Card>
      )}
    </PageContent>
  );
}
