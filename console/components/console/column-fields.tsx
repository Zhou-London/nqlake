"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  Controller,
  useFieldArray,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ICEBERG_TYPES } from "@/lib/schemas";

/**
 * Editable list of column specs (name, type, required, doc) bound to a
 * react-hook-form array field. `name` is the array's path in the form.
 */
export function ColumnFields<T extends FieldValues>({
  control,
  name,
  emptyHint,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  emptyHint?: string;
}) {
  // The array element shape is fixed by columnSchema; the cast keeps
  // useFieldArray generic over the enclosing form.
  const { fields, append, remove } = useFieldArray({
    control,
    name: name as never,
  });
  const path = (i: number, key: string) =>
    `${name}.${i}.${key}` as FieldPath<T>;

  return (
    <div className="flex flex-col gap-2">
      <datalist id="iceberg-types">
        {ICEBERG_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      {fields.length > 0 && (
        <div className="grid grid-cols-[1fr_1fr_auto_1fr_auto] items-center gap-2 px-1 text-xs text-muted-foreground">
          <span>Name</span>
          <span>Type</span>
          <span>Req.</span>
          <span>Doc</span>
          <span />
        </div>
      )}
      {fields.map((field, i) => (
        <div
          key={field.id}
          className="grid grid-cols-[1fr_1fr_auto_1fr_auto] items-start gap-2"
        >
          <Controller
            control={control}
            name={path(i, "name")}
            render={({ field: f, fieldState }) => (
              <div>
                <Input
                  {...f}
                  placeholder="ts_event"
                  className="font-mono"
                  aria-invalid={fieldState.invalid}
                  autoComplete="off"
                />
                <FieldError
                  errors={[fieldState.error]}
                  className="mt-1 text-xs"
                />
              </div>
            )}
          />
          <Controller
            control={control}
            name={path(i, "type")}
            render={({ field: f, fieldState }) => (
              <div>
                <Input
                  {...f}
                  list="iceberg-types"
                  placeholder="long"
                  className="font-mono"
                  aria-invalid={fieldState.invalid}
                  autoComplete="off"
                />
                <FieldError
                  errors={[fieldState.error]}
                  className="mt-1 text-xs"
                />
              </div>
            )}
          />
          <Controller
            control={control}
            name={path(i, "required")}
            render={({ field: f }) => (
              <div className="flex h-8 items-center justify-center px-1">
                <Checkbox
                  checked={Boolean(f.value)}
                  onCheckedChange={(v) => f.onChange(v === true)}
                  aria-label="Required"
                />
              </div>
            )}
          />
          <Controller
            control={control}
            name={path(i, "doc")}
            render={({ field: f }) => (
              <Input
                {...f}
                value={f.value ?? ""}
                placeholder="Optional"
                autoComplete="off"
              />
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => remove(i)}
            aria-label="Remove column"
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      {fields.length === 0 && emptyHint && (
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      )}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            append({ name: "", type: "", required: false, doc: "" } as never)
          }
        >
          <Plus data-icon="inline-start" /> Add column
        </Button>
      </div>
    </div>
  );
}
