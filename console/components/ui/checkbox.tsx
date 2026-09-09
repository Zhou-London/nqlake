"use client";

import { Checkbox as HeroCheckbox, type CheckboxProps } from "@heroui/react";
import {
  useController,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import type { ReactNode } from "react";

export function Checkbox({
  children,
  ...props
}: Omit<CheckboxProps, "children"> & { children: ReactNode }) {
  return (
    <HeroCheckbox {...props}>
      <HeroCheckbox.Content className="items-start gap-2 text-xs leading-5">
        <HeroCheckbox.Control className="mt-0.5 shrink-0">
          <HeroCheckbox.Indicator />
        </HeroCheckbox.Control>
        {children}
      </HeroCheckbox.Content>
    </HeroCheckbox>
  );
}

export function FormCheckbox<T extends FieldValues>({
  control,
  name,
  children,
  isDisabled,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  children: ReactNode;
  isDisabled?: boolean;
}) {
  const { field, fieldState } = useController({ control, name });
  return (
    <Checkbox
      name={name}
      inputRef={field.ref}
      isSelected={!!field.value}
      onChange={field.onChange}
      onBlur={field.onBlur}
      isInvalid={fieldState.invalid}
      isDisabled={isDisabled}
    >
      {children}
    </Checkbox>
  );
}
