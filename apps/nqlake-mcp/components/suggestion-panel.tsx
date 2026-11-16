"use client";

import {
  Alert,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Chip,
  EmptyState,
  IconButton,
  ProgressBar,
  Skeleton,
} from "@nowquant/nqui";
import { Markdown } from "@nowquant/nqui/markdown";
import { Lightbulb, Minus, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { utc } from "@/lib/format";
import { featureTerm } from "@/lib/glossary";
import type { SuggestionView } from "@/lib/suggestions";
import type { Loaded } from "@/lib/use-json";

export const STANCES = {
  bullish: { label: "Bullish", color: "up", icon: <TrendingUp /> },
  bearish: { label: "Bearish", color: "down", icon: <TrendingDown /> },
  neutral: { label: "Neutral", color: "neutral", icon: <Minus /> },
} as const;

export function SuggestionPanel({ suggestions }: { suggestions: Loaded<SuggestionView[]> }) {
  const suggestion = suggestions.data?.[0];
  const stance = suggestion && STANCES[suggestion.stance];
  return (
    <Card>
      <CardHeader className="items-center">
        <div className="flex items-center gap-2">
          <CardTitle>Suggestion</CardTitle>
          {stance && (
            <Chip color={stance.color} startContent={stance.icon}>
              {stance.label}
            </Chip>
          )}
        </div>
        <IconButton aria-label="Refresh" size="sm" isDisabled={suggestions.loading} onPress={suggestions.refresh}>
          <RefreshCw />
        </IconButton>
      </CardHeader>
      {suggestions.error && (
        <CardBody>
          <Alert color="warning" title={suggestions.error} />
        </CardBody>
      )}
      {suggestions.loading && (
        <CardBody>
          <Skeleton className="h-48" />
        </CardBody>
      )}
      {suggestions.data && !suggestion && <EmptyState icon={<Lightbulb />} title="No suggestion" />}
      {suggestion && (
        <>
          <CardBody className="flex flex-col gap-3">
            {suggestion.confidence != null && (
              <ProgressBar label="Confidence" showValue size="sm" value={suggestion.confidence * 100} />
            )}
            <p className="font-medium">{suggestion.title}</p>
            <Markdown className="text-sm">{suggestion.body}</Markdown>
            {suggestion.features.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {suggestion.features.map((feature) => (
                  <Chip key={feature} size="sm" color="neutral">
                    {featureTerm(feature)}
                  </Chip>
                ))}
              </div>
            )}
          </CardBody>
          <CardFooter className="flex flex-col items-start gap-1 text-muted text-xs">
            {suggestion.sources.map((source) => (
              <div key={source.table} className="flex flex-wrap items-center gap-2">
                <span>{source.table}</span>
                <span>as of {utc(source.as_of)}</span>
                {source.stale && (
                  <Chip size="sm" color="warning">
                    Stale
                  </Chip>
                )}
              </div>
            ))}
            <span>
              {suggestion.model} · {utc(suggestion.created_at)}
            </span>
          </CardFooter>
        </>
      )}
    </Card>
  );
}
