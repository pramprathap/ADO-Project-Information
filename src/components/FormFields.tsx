import { useId } from 'react';
import {
  Badge,
  Combobox,
  Dropdown,
  Field,
  Input,
  Option,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type { DropdownOption } from '@/constants/dropdownOptions';

const useSuggestStyles = makeStyles({
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
    width: '100%',
  },
  label: { fontWeight: 600, fontSize: '13px', lineHeight: '18px' },
  req: { color: 'var(--pi-danger)', marginLeft: '2px' },
  hint: { color: 'var(--pi-neutral-swatch)', fontSize: '12px' },
  error: { color: 'var(--pi-danger)', fontSize: '12px' },
});

const useDropdownStyles = makeStyles({
  wrap: { position: 'relative' },
  dot: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    zIndex: 1,
    pointerEvents: 'none',
    boxShadow: '0 0 0 1px rgba(127,127,127,.35)',
  },
  // Push the selected value text right so the swatch has room.
  padded: { '& button': { paddingInlineStart: '28px' } },
});

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

interface TextSuggestFieldProps extends BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Previously-used values offered as type-ahead suggestions. */
  suggestions: string[];
  maxLength?: number;
  placeholder?: string;
}

/**
 * A free-text field with type-ahead suggestions from a supplied list. The user
 * can pick an existing value or type a new one (which the caller persists so it
 * appears next time). Uses its own label + Combobox layout (not Fluent Field)
 * to avoid the Field-wrapping-Combobox height/overlap issue.
 */
export function TextSuggestField({
  label,
  value,
  onChange,
  suggestions,
  required,
  disabled,
  error,
  hint,
  maxLength,
  placeholder,
  fieldId,
}: TextSuggestFieldProps) {
  const styles = useSuggestStyles();
  const generated = useId();
  const id = fieldId ?? generated;
  const query = (value ?? '').trim().toLowerCase();
  const matches = (
    query ? suggestions.filter((s) => s.toLowerCase().includes(query)) : suggestions
  ).slice(0, 8);

  return (
    <div className={styles.wrapper}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required && (
          <span className={styles.req} aria-hidden>
            *
          </span>
        )}
      </label>
      <Combobox
        id={id}
        freeform
        clearable
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) =>
          onChange(
            (e.target as HTMLInputElement).value.slice(0, maxLength ?? Number.MAX_SAFE_INTEGER),
          )
        }
        onOptionSelect={(_e, data) => {
          if (typeof data.optionValue === 'string') {
            onChange(data.optionValue);
          }
        }}
        aria-label={label}
      >
        {matches.map((s) => (
          <Option key={s} value={s} text={s}>
            {s}
          </Option>
        ))}
      </Combobox>
      {hint && !error && <span className={styles.hint}>{hint}</span>}
      {error && <span className={styles.error}>{error}</span>}
    </div>
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
  const styles = useDropdownStyles();
  const selected = options.find((o) => o.value === value);
  const selectedText = selected?.label ?? '';
  const selectedColor = selected?.color;
  return (
    <Field
      label={label}
      required={required}
      validationState={error ? 'error' : 'none'}
      validationMessage={error}
      hint={hint}
    >
      <div className={styles.wrap}>
        {selectedColor && (
          <span aria-hidden className={styles.dot} style={{ backgroundColor: selectedColor }} />
        )}
        <Dropdown
          id={id}
          className={selectedColor ? styles.padded : undefined}
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
      </div>
    </Field>
  );
}
