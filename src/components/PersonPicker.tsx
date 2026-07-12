import { useId, useState } from 'react';
import {
  Badge,
  Button,
  Combobox,
  Option,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { DismissRegular, EditRegular } from '@fluentui/react-icons';
import type { AzureDevOpsIdentity } from '@/models/AzureDevOpsIdentity';
import type { IdentityService } from '@/services/IdentityService';
import { useIdentitySearch } from '@/hooks/useIdentitySearch';
import { GradientAvatar } from './GradientAvatar';

const useStyles = makeStyles({
  // Own label + control layout (not Fluent <Field>) so the control's full
  // height is always part of the layout — a Field wrapping the Combobox
  // under-reported its height and caused adjacent rows to overlap.
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    width: '100%',
    minWidth: 0,
  },
  label: {
    fontWeight: 600,
    fontSize: '13px',
    lineHeight: '18px',
    color: tokens.colorNeutralForeground1,
  },
  req: { color: 'var(--pi-danger)', marginLeft: '2px' },
  selected: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    padding: `2px ${tokens.spacingHorizontalXS} 2px ${tokens.spacingHorizontalS}`,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    minHeight: '32px',
    minWidth: 0,
    overflow: 'hidden',
  },
  selectedPerson: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
    flex: '1 1 auto',
    overflow: 'hidden',
  },
  selectedText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
    lineHeight: '1.25',
  },
  selectedName: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontWeight: 600,
    fontSize: '13px',
  },
  selectedEmail: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    flexShrink: 0,
  },
  optionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  option: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  optionSecondary: {
    color: tokens.colorNeutralForeground3,
  },
  error: { color: 'var(--pi-danger)', fontSize: '12px' },
});

export interface PersonPickerProps {
  label: string;
  value: AzureDevOpsIdentity | null;
  onChange: (identity: AzureDevOpsIdentity | null) => void;
  identityService: IdentityService;
  required?: boolean;
  disabled?: boolean;
  validationMessage?: string;
  /** Ref target id used to move focus to this field on validation failure. */
  fieldId?: string;
}

export function PersonPicker({
  label,
  value,
  onChange,
  identityService,
  required = false,
  disabled = false,
  validationMessage,
  fieldId,
}: PersonPickerProps) {
  const styles = useStyles();
  const generatedId = useId();
  const comboId = fieldId ?? generatedId;
  const [editing, setEditing] = useState(false);
  const search = useIdentitySearch(identityService);

  const showSelected = value && !editing;

  const handleSelect = (descriptor: string): void => {
    const picked = search.results.find((r) => r.descriptor === descriptor);
    if (picked) {
      onChange(picked);
      setEditing(false);
      search.clear();
    }
  };

  const startEditing = (): void => {
    setEditing(true);
    search.clear();
  };

  const remove = (): void => {
    onChange(null);
    setEditing(false);
    search.clear();
  };

  return (
    <div className={styles.wrapper}>
      <label className={styles.label} htmlFor={comboId}>
        {label}
        {required && (
          <span className={styles.req} aria-hidden>
            *
          </span>
        )}
      </label>

      {showSelected ? (
        <div className={styles.selected}>
          <span
            className={styles.selectedPerson}
            title={value.email ?? value.principalName ?? value.displayName}
          >
            <GradientAvatar
              name={value.displayName}
              colorKey={value.descriptor}
              imageUrl={value.imageUrl}
              size={28}
            />
            <span className={styles.selectedText}>
              <span className={styles.selectedName}>{value.displayName}</span>
              {(value.email ?? value.principalName) && (
                <span className={styles.selectedEmail}>{value.email ?? value.principalName}</span>
              )}
            </span>
          </span>
          <div className={styles.actions}>
            {value.isActive === false && (
              <Badge appearance="tint" color="warning" title="This user may have been removed.">
                Inactive
              </Badge>
            )}
            {!disabled && (
              <>
                <Button
                  appearance="subtle"
                  icon={<EditRegular />}
                  aria-label={`Change ${label}`}
                  onClick={startEditing}
                />
                <Button
                  appearance="subtle"
                  icon={<DismissRegular />}
                  aria-label={`Remove ${label}`}
                  onClick={remove}
                />
              </>
            )}
          </div>
        </div>
      ) : (
        <Combobox
          id={comboId}
          freeform
          clearable
          disabled={disabled}
          placeholder="Search by name or email…"
          value={search.query}
          onChange={(e) => search.setQuery((e.target as HTMLInputElement).value)}
          onOptionSelect={(_e, data) => {
            if (data.optionValue) {
              handleSelect(data.optionValue);
            }
          }}
          aria-label={label}
        >
          {search.isSearching && (
            <Option value="__loading" disabled text="Searching…">
              <Spinner size="tiny" label="Searching…" />
            </Option>
          )}
          {!search.isSearching &&
            search.results.map((identity) => (
              <Option
                key={identity.descriptor}
                value={identity.descriptor}
                text={identity.displayName}
              >
                <div className={styles.optionRow}>
                  <GradientAvatar
                    name={identity.displayName}
                    colorKey={identity.descriptor}
                    imageUrl={identity.imageUrl}
                    size={28}
                  />
                  <div className={styles.option}>
                    <Text>{identity.displayName}</Text>
                    {(identity.email || identity.principalName) && (
                      <Text size={200} className={styles.optionSecondary}>
                        {identity.email ?? identity.principalName}
                      </Text>
                    )}
                  </div>
                </div>
              </Option>
            ))}
          {!search.isSearching &&
            search.query.trim().length >= 2 &&
            search.results.length === 0 &&
            !search.error && (
              <Option value="__none" disabled text="No matches">
                No matching people found
              </Option>
            )}
        </Combobox>
      )}

      {search.error && <span className={styles.error}>{search.error}</span>}
      {validationMessage && <span className={styles.error}>{validationMessage}</span>}
    </div>
  );
}
