"use client";

import { Label, ListBox, Select } from "@heroui/react";
import {
  useController,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import type { ComponentProps, Ref } from "react";
import { cn } from "@/lib/utils";

type SelectOption = { value: string; label: string };

export function SelectField({
  label,
  options,
  value,
  onChange,
  onBlur,
  isDisabled,
  isInvalid,
  name,
  id,
  placeholder = "Select an option",
  className,
  triggerRef,
}: {
  label: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  isDisabled?: boolean;
  isInvalid?: boolean;
  name?: string;
  id?: string;
  placeholder?: string;
  className?: string;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <Select
      name={name}
      value={value || null}
      onChange={(key) => onChange(key == null ? "" : String(key))}
      onBlur={onBlur}
      isDisabled={isDisabled}
      isInvalid={isInvalid}
      placeholder={placeholder}
      className={cn("min-w-0", className)}
    >
      <Label className="sr-only">{label}</Label>
      <Select.Trigger
        id={id}
        ref={triggerRef}
        className="h-9 w-full min-w-0 gap-3 text-xs"
      >
        <Select.Value className="truncate" />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox aria-label={label}>
          {options.map((option) => (
            <ListBox.Item
              key={option.value}
              id={option.value}
              textValue={option.label}
            >
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export function FormSelect<T extends FieldValues>({
  control,
  name,
  valueAsNumber,
  ...props
}: Omit<
  ComponentProps<typeof SelectField>,
  "value" | "onChange" | "name" | "triggerRef"
> & { control: Control<T>; name: FieldPath<T>; valueAsNumber?: boolean }) {
  const { field, fieldState } = useController({ control, name });
  return (
    <SelectField
      {...props}
      name={name}
      value={String(field.value ?? "")}
      onChange={(value) =>
        field.onChange(valueAsNumber ? Number(value) : value)
      }
      onBlur={field.onBlur}
      triggerRef={field.ref}
      isInvalid={fieldState.invalid}
    />
  );
}
