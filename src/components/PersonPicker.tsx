import { useId, useState } from 'react';
import {
  Badge,
  Button,
  Combobox,
  Field,
  Option,
  Persona,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { DismissRegular, EditRegular } from '@fluentui/react-icons';
import type { AzureDevOpsIdentity } from '@/models/AzureDevOpsIdentity';
import type { IdentityService } from '@/services/IdentityService';
import { useIdentitySearch } from '@/hooks/useIdentitySearch';

const useStyles = makeStyles({
  selected: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalXS,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    flexShrink: 0,
  },
  option: {
    display: 'flex',
    flexDirection: 'column',
  },
  optionSecondary: {
    color: tokens.colorNeutralForeground3,
  },
  hint: {
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalXS,
    display: 'block',
  },
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
    <Field
      label={label}
      required={required}
      validationState={validationMessage ? 'error' : 'none'}
      validationMessage={validationMessage}
    >
      {showSelected ? (
        <div className={styles.selected}>
          <Persona
            name={value.displayName}
            secondaryText={value.email ?? value.principalName ?? undefined}
            avatar={{ image: value.imageUrl ? { src: value.imageUrl } : undefined }}
            presence={undefined}
          />
          <div className={styles.actions}>
            {value.isActive === false && (
              <Badge
                appearance="tint"
                color="warning"
                title="This user may have been removed or disabled."
              >
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
        <>
          <Combobox
            id={comboId}
            freeform
            clearable
            disabled={disabled}
            placeholder="Search by name or email…"
            value={search.query}
            open={search.query.trim().length >= 2 ? undefined : false}
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
                  <div className={styles.option}>
                    <Text>{identity.displayName}</Text>
                    {(identity.email || identity.principalName) && (
                      <Text size={200} className={styles.optionSecondary}>
                        {identity.email ?? identity.principalName}
                      </Text>
                    )}
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
          {search.error && (
            <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
              {search.error}
            </Text>
          )}
          {value && editing && (
            <Text size={200} className={styles.hint}>
              Currently selected: {value.displayName}.{' '}
              <Button appearance="transparent" size="small" onClick={() => setEditing(false)}>
                Keep
              </Button>
            </Text>
          )}
        </>
      )}
    </Field>
  );
}
