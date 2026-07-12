import { Button, Field, Input, Text, makeStyles, tokens } from '@fluentui/react-components';
import { AddRegular, DeleteRegular } from '@fluentui/react-icons';
import { MAX_CLIENT_CONTACTS, type ClientContact } from '@/models/ProjectInformation';

const useStyles = makeStyles({
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto',
    gap: tokens.spacingHorizontalM,
    alignItems: 'end',
    marginBottom: tokens.spacingVerticalM,
    '@media (max-width: 520px)': { gridTemplateColumns: '1fr' },
  },
  error: { color: 'var(--pi-danger)', display: 'block', marginBottom: tokens.spacingVerticalS },
});

interface ClientContactsEditorProps {
  value: ClientContact[];
  onChange: (contacts: ClientContact[]) => void;
  disabled?: boolean;
  error?: string;
}

export function ClientContactsEditor({
  value,
  onChange,
  disabled = false,
  error,
}: ClientContactsEditorProps) {
  const styles = useStyles();

  const update = (index: number, patch: Partial<ClientContact>): void => {
    onChange(value.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };
  const remove = (index: number): void => onChange(value.filter((_, i) => i !== index));
  const add = (): void => onChange([...value, { name: '', email: '' }]);

  return (
    <div style={{ flexBasis: '100%', width: '100%' }}>
      {error && (
        <Text size={200} className={styles.error}>
          {error}
        </Text>
      )}

      {value.map((contact, index) => (
        <div className={styles.row} key={index}>
          <Field label={index === 0 ? 'Contact Name' : `Contact ${index + 1} Name`}>
            <Input
              disabled={disabled}
              value={contact.name}
              maxLength={200}
              onChange={(_e, data) => update(index, { name: data.value })}
            />
          </Field>
          <Field label="Contact Email">
            <Input
              type="email"
              disabled={disabled}
              value={contact.email}
              maxLength={320}
              onChange={(_e, data) => update(index, { email: data.value })}
            />
          </Field>
          {!disabled && (
            <Button
              appearance="subtle"
              icon={<DeleteRegular />}
              aria-label={`Remove contact ${index + 1}`}
              onClick={() => remove(index)}
              style={{ marginBottom: '2px' }}
            />
          )}
        </div>
      ))}

      {!disabled && value.length < MAX_CLIENT_CONTACTS && (
        <Button appearance="secondary" icon={<AddRegular />} onClick={add}>
          Add client contact
        </Button>
      )}
    </div>
  );
}
