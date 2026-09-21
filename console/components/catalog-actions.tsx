"use client";
import { useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Form,
  IconButton,
  Modal,
  Select,
  SelectItem,
  TextField,
  toast,
} from "@nowquant/nqui";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useLake } from "@/components/lake-provider";

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const NAMESPACE = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;
const IDENTIFIER_HINT =
  "Use letters, numbers, and underscores. Start with a letter or underscore.";
export const COLUMN_TYPES = [
  "string",
  "long",
  "int",
  "double",
  "float",
  "boolean",
  "date",
  "timestamp",
  "timestamptz",
  "uuid",
  "binary",
  "decimal(20,0)",
];

export function NewNamespaceButton({
  variant = "outline",
}: {
  variant?: "outline" | "solid";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { refresh } = useLake();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    setBusy(true);
    setError("");
    try {
      await api("/namespaces", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      toast.success("Namespace created.");
      setOpen(false);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant={variant}
        startContent={<Plus />}
        onPress={() => {
          setError("");
          setOpen(true);
        }}
      >
        New namespace
      </Button>
      <Modal
        isOpen={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
        isDismissable={!busy}
        isKeyboardDismissDisabled={busy}
      >
        <Dialog>
          <Form onSubmit={submit} className="flex min-h-0 flex-col">
            <DialogHeader
              title="New namespace"
              description="Group tables by source or domain. Use dots for nested namespaces."
              showClose
            />
            <DialogBody className="flex flex-col gap-4">
              {error && <Alert color="error" title={error} />}
              <TextField
                name="name"
                label="Namespace name"
                placeholder="e.g. raw or analytics"
                autoFocus
                isRequired
                isDisabled={busy}
                validate={(value) =>
                  NAMESPACE.test(value.trim())
                    ? null
                    : "Enter a valid name, such as raw or raw.events."
                }
              />
            </DialogBody>
            <DialogFooter>
              <Button
                variant="ghost"
                isDisabled={busy}
                onPress={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" color="primary" isLoading={busy}>
                Create namespace
              </Button>
            </DialogFooter>
          </Form>
        </Dialog>
      </Modal>
    </>
  );
}

type ColumnDraft = {
  key: number;
  name: string;
  type: string;
  required: boolean;
};

export function NewTableButton({ namespace }: { namespace?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [target, setTarget] = useState("");
  const [columns, setColumns] = useState<ColumnDraft[]>([]);
  const { namespaces, refresh } = useLake();
  function reset() {
    setError("");
    setTarget(namespace || namespaces[0] || "");
    setColumns([{ key: 0, name: "id", type: "long", required: true }]);
  }
  function update(key: number, patch: Partial<ColumnDraft>) {
    setColumns((items) =>
      items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    setBusy(true);
    setError("");
    try {
      await api(`/namespaces/${encodeURIComponent(target)}/tables`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          columns: columns.map(({ name, type, required }) => ({
            name: name.trim(),
            type,
            required,
          })),
        }),
      });
      toast.success("Table created.");
      setOpen(false);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        color="primary"
        startContent={<Plus />}
        disabledReason={
          namespaces.length ? undefined : "Create a namespace first"
        }
        onPress={() => {
          reset();
          setOpen(true);
        }}
      >
        New table
      </Button>
      <Modal
        size="lg"
        isOpen={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
        isDismissable={!busy}
        isKeyboardDismissDisabled={busy}
      >
        <Dialog>
          <Form onSubmit={submit} className="flex min-h-0 flex-col">
            <DialogHeader
              title="New table"
              description="Define columns to create an Apache Iceberg v2 table."
              showClose
            />
            <DialogBody className="flex flex-col gap-6">
              {error && <Alert color="error" title={error} />}
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Namespace"
                  name="namespace"
                  isRequired
                  isDisabled={busy}
                  selectedKey={target}
                  onSelectionChange={(key) => setTarget(String(key))}
                >
                  {namespaces.map((item) => (
                    <SelectItem key={item} id={item}>
                      {item}
                    </SelectItem>
                  ))}
                </Select>
                <TextField
                  name="name"
                  label="Table name"
                  placeholder="e.g. events"
                  isRequired
                  isDisabled={busy}
                  validate={(value) =>
                    IDENTIFIER.test(value.trim()) ? null : IDENTIFIER_HINT
                  }
                />
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">Columns</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    startContent={<Plus />}
                    isDisabled={busy}
                    onPress={() =>
                      setColumns((items) => [
                        ...items,
                        {
                          key: Date.now(),
                          name: "",
                          type: "string",
                          required: false,
                        },
                      ])
                    }
                  >
                    Add column
                  </Button>
                </div>
                {columns.map((column, index) => (
                  <div
                    key={column.key}
                    className="flex flex-wrap items-start gap-2"
                  >
                    <TextField
                      aria-label={`Column ${index + 1} name`}
                      className="min-w-40 flex-1"
                      placeholder="Column name"
                      isRequired
                      isDisabled={busy}
                      value={column.name}
                      onChange={(value) => update(column.key, { name: value })}
                      validate={(value) =>
                        !IDENTIFIER.test(value.trim())
                          ? IDENTIFIER_HINT
                          : columns.filter(
                                (item) => item.name.trim() === value.trim(),
                              ).length > 1
                            ? "Column names must be unique."
                            : null
                      }
                    />
                    <Select
                      aria-label={`Column ${index + 1} type`}
                      className="w-36"
                      isDisabled={busy}
                      selectedKey={column.type}
                      onSelectionChange={(key) =>
                        update(column.key, { type: String(key) })
                      }
                    >
                      {COLUMN_TYPES.map((type) => (
                        <SelectItem key={type} id={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </Select>
                    <Checkbox
                      className="h-10"
                      isDisabled={busy}
                      isSelected={column.required}
                      onChange={(value) =>
                        update(column.key, { required: value })
                      }
                    >
                      Required
                    </Checkbox>
                    <IconButton
                      aria-label={`Remove column ${index + 1}`}
                      isDisabled={busy || columns.length === 1}
                      onPress={() =>
                        setColumns((items) =>
                          items.filter((item) => item.key !== column.key),
                        )
                      }
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                ))}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button
                variant="ghost"
                isDisabled={busy}
                onPress={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" color="primary" isLoading={busy}>
                Create table
              </Button>
            </DialogFooter>
          </Form>
        </Dialog>
      </Modal>
    </>
  );
}
