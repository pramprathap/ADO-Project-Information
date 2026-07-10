import { useId } from 'react';
import { Badge, Dropdown, Field, Input, Option, Text, Textarea } from '@fluentui/react-components';
import type { DropdownOption } from '@/constants/dropdownOptions';

interface BaseFieldProps {
  label: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: string;
  fieldId?: string;
}

interface TextFieldProps extends BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  type?: 'text' | 'email' | 'url';
}

export function TextField({
  label,
  value,
  onChange,
  required,
  disabled,
  error,
  hint,
  maxLength,
  placeholder,
  type = 'text',
  fieldId,
}: TextFieldProps) {
  const generated = useId();
  const id = fieldId ?? generated;
  return (
    <Field
      label={label}
      required={required}
      validationState={error ? 'error' : 'none'}
      validationMessage={error}
      hint={hint}
    >
      <Input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(_e, data) => onChange(data.value)}
      />
    </Field>
  );
}

interface TextAreaFieldProps extends BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  rows?: number;
  placeholder?: string;
}

export function TextAreaField({
  label,
  value,
  onChange,
  required,
  disabled,
  error,
  hint,
  maxLength,
  rows = 3,
  placeholder,
  fieldId,
}: TextAreaFieldProps) {
  const generated = useId();
  const id = fieldId ?? generated;
  return (
    <Field
      label={label}
      required={required}
      validationState={error ? 'error' : 'none'}
      validationMessage={error}
      hint={hint}
    >
      <Textarea
        id={id}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
        onChange={(_e, data) => onChange(data.value)}
        resize="vertical"
      />
    </Field>
  );
}

interface DateFieldProps extends BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function DateField({
  label,
  value,
  onChange,
  required,
  disabled,
  error,
  hint,
  fieldId,
}: DateFieldProps) {
  const generated = useId();
  const id = fieldId ?? generated;
  // A native date input yields ISO `YYYY-MM-DD`, matching our stored format,
  // and is fully keyboard accessible and theme-neutral.
  return (
    <Field
      label={label}
      required={required}
      validationState={error ? 'error' : 'none'}
      validationMessage={error}
      hint={hint}
    >
      <Input
        id={id}
        type="date"
        value={value}
        disabled={disabled}
        onChange={(_e, data) => onChange(data.value)}
      />
    </Field>
  );
}

interface ReadOnlyStatProps {
  label: string;
  value: string;
  caption?: string;
}

/** A non-editable, labelled value (e.g. a computed counter). */
export function ReadOnlyStat({ label, value, caption }: ReadOnlyStatProps) {
  return (
    <Field label={label} hint={caption}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32 }}>
        <Badge appearance="tint" color="informative" size="extra-large">
          {value}
        </Badge>
        <Text size={200} style={{ color: 'var(--pi-neutral-swatch)' }}>
          {Number(value) === 1 ? 'revision' : 'revisions'}
        </Text>
      </div>
    </Field>
  );
}

interface DropdownFieldProps<T extends string> extends BaseFieldProps {
  value: T | '';
  options: DropdownOption<T>[];
  onChange: (value: T | '') => void;
  placeholder?: string;
  /** When true a blank "— None —" option is offered (for optional dropdowns). */
  allowEmpty?: boolean;
}

export function DropdownField<T extends string>({
  label,
  value,
  options,
  onChange,
  required,
  disabled,
  error,
  hint,
  placeholder = 'Select…',
  allowEmpty = false,
  fieldId,
}: DropdownFieldProps<T>) {
  const generated = useId();
  const id = fieldId ?? generated;
  const selectedText = options.find((o) => o.value === value)?.label ?? '';
  return (
    <Field
      label={label}
      required={required}
      validationState={error ? 'error' : 'none'}
      validationMessage={error}
      hint={hint}
    >
      <Dropdown
        id={id}
        disabled={disabled}
        placeholder={placeholder}
        value={selectedText}
        selectedOptions={value ? [value] : []}
        onOptionSelect={(_e, data) => onChange((data.optionValue as T) ?? '')}
      >
        {allowEmpty && (
          <Option value="" text="— None —">
            — None —
          </Option>
        )}
        {options.map((option) => (
          <Option key={option.value} value={option.value} text={option.label}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {option.color && (
                <span
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: option.color,
                    flex: 'none',
                    boxShadow: '0 0 0 1px rgba(127,127,127,.35)',
                  }}
                />
              )}
              {option.label}
            </span>
          </Option>
        ))}
      </Dropdown>
    </Field>
  );
}
