"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionItem,
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Chip,
  Code,
  Dialog,
  EmptyState,
  IconButton,
  NumberField,
  Popover,
  PopoverTrigger,
  Stat,
  TextField,
  ToggleButton,
  toast,
} from "@nowquant/nqui";
import { Check, Copy, RefreshCw, Settings2 } from "lucide-react";
import { api, type ArrowState, type ArrowTransfer } from "@/lib/api";
import { arrowReceiverSnippet } from "@/lib/data.mjs";
import { number } from "@/lib/utils";

const MAX_BATCH_SIZE = 1_000_000;
/** How often the workspace asks the backend about transfers while one is waiting or running. */
const POLL_MS = 2000;

export type StreamSettings = {
  batchSize: number;
  /** Empty means the backend's `ARROW_PORT`; "0" lets the backend pick any free port. */
  port: string;
};
export const DEFAULT_STREAM_SETTINGS: StreamSettings = {
  batchSize: 65_536,
  port: "",
};

export const ACTIVE_STATES: ArrowState[] = ["waiting", "running"];
export const isActive = (transfer: ArrowTransfer) =>
  ACTIVE_STATES.includes(transfer.state);

/** Asks the backend to bind a port and stream every row of `sql` to it; no row limit applies. */
export async function startTransfer(
  sql: string,
  settings: StreamSettings,
  signal?: AbortSignal,
): Promise<ArrowTransfer> {
  const port = settings.port.trim();
  return api<ArrowTransfer>("/query/arrow", {
    method: "POST",
    body: JSON.stringify({
      sql,
      batch_size: settings.batchSize,
      ...(port ? { port: Number(port) } : {}),
    }),
    signal,
  });
}

/** Stops a transfer: unbinds a waiting port, or cuts the stream a receiver is reading. */
export function stopTransfer(id: number): Promise<ArrowTransfer> {
  return api<ArrowTransfer>(`/query/arrow/${id}`, { method: "DELETE" });
}

/**
 * The backend's list of transfers, loaded when the workspace opens and
 * polled while any transfer is waiting or running. `refresh` reloads at once,
 * for instance after starting one.
 */
export function useArrowTransfers() {
  const [transfers, setTransfers] = useState<ArrowTransfer[] | null>(null);
  const [error, setError] = useState("");
  const loading = useRef(false);
  const refresh = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      setTransfers(await api<ArrowTransfer[]>("/query/arrow"));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      loading.current = false;
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const active = !!transfers?.some(isActive);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, refresh]);
  return { transfers, error, refresh };
}

/** Empty (the backend's default), or an integer from 0 (any free port) to 65535. */
export function isValidPort(port: string) {
  const trimmed = port.trim();
  return !trimmed || (/^\d{1,5}$/.test(trimmed) && Number(trimmed) <= 65535);
}

/** Gear button with the popover that edits the batch size and the port of the next transfer. */
export function StreamSettingsButton({
  settings,
  onChange,
  isDisabled,
}: {
  settings: StreamSettings;
  onChange: (settings: StreamSettings) => void;
  isDisabled?: boolean;
}) {
  return (
    <PopoverTrigger>
      <IconButton
        aria-label="Streaming settings"
        size="sm"
        isDisabled={isDisabled}
      >
        <Settings2 />
      </IconButton>
      <Popover placement="bottom end" className="w-80">
        <Dialog className="flex flex-col gap-4 p-4">
          <NumberField
            label="Rows per batch"
            description="Each record batch carries this many rows; the default keeps one batch of a wide table at a few megabytes."
            size="sm"
            isRequired
            minValue={1}
            maxValue={MAX_BATCH_SIZE}
            formatOptions={{ useGrouping: true }}
            value={settings.batchSize}
            onChange={(batchSize) => onChange({ ...settings, batchSize })}
          />
          <TextField
            label="Port"
            placeholder="ARROW_PORT from .env"
            description="Port to bind on the backend's ARROW_HOST. Leave it empty for the backend's default, or enter 0 to let it pick any free port."
            size="sm"
            inputMode="numeric"
            value={settings.port}
            onChange={(port) => onChange({ ...settings, port })}
            isInvalid={!isValidPort(settings.port)}
            errorMessage="Enter a port from 0 to 65535."
          />
        </Dialog>
      </Popover>
    </PopoverTrigger>
  );
}

const STATE_LABEL: Record<ArrowState, string> = {
  waiting: "Waiting for a receiver",
  running: "Sending",
  done: "Completed",
  failed: "Failed",
  abandoned: "Abandoned",
  closed: "Closed",
};
const STATE_COLOR: Record<
  ArrowState,
  "warning" | "primary" | "success" | "error" | "neutral"
> = {
  waiting: "warning",
  running: "primary",
  done: "success",
  failed: "error",
  abandoned: "neutral",
  closed: "neutral",
};

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US");

/** The backend's log of one transfer, one line per event. */
function TransferLog({ transfer }: { transfer: ArrowTransfer }) {
  return (
    <Code className="block max-h-40 overflow-auto whitespace-pre-wrap p-3 text-xs">
      {transfer.log
        .map((entry) => `${time(entry.time)}  ${entry.message}`)
        .join("\n")}
    </Code>
  );
}

/**
 * The transfers the backend holds: every waiting or running one as a card
 * with its address, log, and a Stop button, and the recent finished ones
 * folded away with their logs.
 */
export function ArrowTransfersPanel({
  transfers,
  error,
  onRefresh,
}: {
  transfers: ArrowTransfer[] | null;
  error: string;
  onRefresh: () => Promise<void>;
}) {
  const [showFinished, setShowFinished] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const active = transfers?.filter(isActive) ?? [];
  const finished = transfers?.filter((t) => !isActive(t)) ?? [];
  async function refresh() {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }
  return (
    <Card>
      <CardHeader className="items-center">
        <CardTitle>Arrow transfers</CardTitle>
        <div className="flex items-center gap-2">
          <Chip color={active.length ? "warning" : "neutral"}>
            {active.length} open
          </Chip>
          <ToggleButton
            size="sm"
            variant="outline"
            isSelected={showFinished}
            onChange={setShowFinished}
          >
            Finished ({finished.length})
          </ToggleButton>
          <IconButton
            aria-label="Refresh transfers"
            size="sm"
            isLoading={refreshing}
            onPress={() => void refresh()}
          >
            <RefreshCw />
          </IconButton>
        </div>
      </CardHeader>
      {error && (
        <CardBody>
          <Alert
            color="error"
            title="Could not list transfers"
            description={error}
          />
        </CardBody>
      )}
      {active.length ? (
        <CardBody className="flex flex-col gap-4">
          {active.map((transfer) => (
            <ActiveTransfer
              key={transfer.id}
              transfer={transfer}
              onChanged={onRefresh}
            />
          ))}
        </CardBody>
      ) : (
        !error && (
          <EmptyState
            size="sm"
            title="No open transfers"
            description="A transfer holds its port from Run until a receiver has read every row, or until you stop it here."
          />
        )
      )}
      {showFinished &&
        (finished.length ? (
          <Accordion variant="divided">
            {finished.map((transfer) => (
              <AccordionItem
                key={transfer.id}
                id={String(transfer.id)}
                title={
                  <span className="flex items-center gap-2">
                    <Chip size="sm" color={STATE_COLOR[transfer.state]}>
                      {STATE_LABEL[transfer.state]}
                    </Chip>
                    <span>
                      #{transfer.id} · {transfer.host}:{transfer.port}
                    </span>
                  </span>
                }
                subtitle={`${number(transfer.rows)} rows · started ${time(transfer.started)}${
                  transfer.ended ? ` · ended ${time(transfer.ended)}` : ""
                }`}
              >
                <div className="flex flex-col gap-3">
                  <Code className="block max-h-24 overflow-auto whitespace-pre-wrap text-muted">
                    {transfer.sql}
                  </Code>
                  <TransferLog transfer={transfer} />
                </div>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <EmptyState
            size="sm"
            title="No finished transfers"
            description="The backend keeps the last 20 finished transfers with their logs."
          />
        ))}
    </Card>
  );
}

/** One waiting or running transfer: where to connect, what has happened, and the Stop button. */
function ActiveTransfer({
  transfer,
  onChanged,
}: {
  transfer: ArrowTransfer;
  onChanged: () => Promise<void>;
}) {
  const waiting = transfer.state === "waiting";
  const [stopping, setStopping] = useState(false);
  async function stop() {
    setStopping(true);
    try {
      const ended = await stopTransfer(transfer.id);
      toast.success(
        ended.state === "abandoned"
          ? `Transfer #${transfer.id} abandoned; port ${transfer.port} is free.`
          : `Transfer #${transfer.id} closed after ${number(ended.rows)} rows.`,
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setStopping(false);
      await onChanged();
    }
  }

  const address = `${transfer.host}:${transfer.port}`;
  const [copied, setCopied] = useState<"address" | "code" | null>(null);
  const snippet = arrowReceiverSnippet(transfer.host, transfer.port);
  async function copy(what: "address" | "code") {
    try {
      await navigator.clipboard.writeText(
        what === "address" ? address : snippet,
      );
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  }
  return (
    <Card>
      <CardHeader className="items-center">
        <CardTitle>Transfer #{transfer.id}</CardTitle>
        <div className="flex items-center gap-2">
          <Chip
            variant="dot"
            color={STATE_COLOR[transfer.state]}
            aria-live="polite"
          >
            {STATE_LABEL[transfer.state]}
          </Chip>
          <Button
            size="sm"
            variant="ghost"
            color="error"
            isLoading={stopping}
            onPress={stop}
          >
            {waiting ? "Abandon" : "Close"}
          </Button>
        </div>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {waiting ? (
          <Alert
            color="info"
            title="Connect to the port from any machine that can reach the API host."
            description="The port stays bound until a receiver connects or you abandon the transfer. The stream carries the schema, one record batch at a time, then the end-of-stream marker."
          />
        ) : (
          <Alert
            color="neutral"
            title={`${transfer.receiver} is reading the stream.`}
            description="Close ends the stream at once; the receiver's reader raises instead of taking the rows so far for the whole result."
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Code className="min-w-0 break-all">{address}</Code>
          <IconButton
            aria-label={copied === "address" ? "Copied" : "Copy address"}
            size="sm"
            onPress={() => copy("address")}
          >
            {copied === "address" ? <Check /> : <Copy />}
          </IconButton>
        </div>
        <div className="flex flex-wrap gap-8">
          <Stat label="Rows per batch" value={number(transfer.batch_size)} />
          <Stat label="Rows sent" value={number(transfer.rows)} />
          <Stat label="Started" value={time(transfer.started)} />
        </div>
        <Code className="block max-h-24 overflow-auto whitespace-pre-wrap text-muted">
          {transfer.sql}
        </Code>
        <div className="flex flex-col gap-2">
          <span className="text-muted text-sm">Log</span>
          <TransferLog transfer={transfer} />
        </div>
        {waiting && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-muted text-sm">Receiver, in Python</span>
              <Button
                size="sm"
                variant="ghost"
                startContent={copied === "code" ? <Check /> : <Copy />}
                onPress={() => copy("code")}
              >
                {copied === "code" ? "Copied" : "Copy code"}
              </Button>
            </div>
            <Code className="block overflow-auto whitespace-pre p-4">
              {snippet}
            </Code>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
