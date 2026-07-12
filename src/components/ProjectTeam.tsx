import {
  Button,
  Dropdown,
  Field,
  Option,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { AddRegular, DeleteRegular } from '@fluentui/react-icons';
import type { TeamMember } from '@/models/ProjectInformation';
import type { AzureDevOpsIdentity } from '@/models/AzureDevOpsIdentity';
import type { IdentityService } from '@/services/IdentityService';
import { TEAM_ROLE_OPTIONS } from '@/constants/dropdownOptions';
import { PersonPicker } from './PersonPicker';

const useStyles = makeStyles({
  row: {
    display: 'grid',
    // Role gets a fixed compact width; the resource picker takes the rest so the
    // row fits neatly inside a single column card.
    gridTemplateColumns: 'minmax(160px, 200px) minmax(0, 1fr) auto',
    gap: tokens.spacingHorizontalS,
    alignItems: 'start',
    marginBottom: tokens.spacingVerticalM,
    '@media (max-width: 520px)': {
      gridTemplateColumns: '1fr',
    },
  },
  // Offset the delete button down past the field labels so it lines up with the
  // Role dropdown / Resource control rather than the labels.
  remove: { marginTop: '22px' },
  empty: { color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalM },
  error: { color: 'var(--pi-danger)', display: 'block', marginBottom: tokens.spacingVerticalS },
});

interface ProjectTeamProps {
  value: TeamMember[];
  onChange: (team: TeamMember[]) => void;
  identityService: IdentityService;
  disabled?: boolean;
  error?: string;
}

export function ProjectTeam({
  value,
  onChange,
  identityService,
  disabled = false,
  error,
}: ProjectTeamProps) {
  const styles = useStyles();

  const updateRow = (index: number, patch: Partial<TeamMember>): void => {
    onChange(value.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };
  const removeRow = (index: number): void => {
    onChange(value.filter((_, i) => i !== index));
  };
  const addRow = (): void => {
    onChange([...value, { role: '', identity: null }]);
  };

  return (
    <div style={{ flexBasis: '100%', width: '100%' }}>
      {error && (
        <Text size={200} className={styles.error}>
          {error}
        </Text>
      )}

      {value.length === 0 && (
        <Text size={200} className={styles.empty} block>
          No team members yet. Add rows to record who is working on this project and their role.
        </Text>
      )}

      {value.map((member, index) => (
        <div className={styles.row} key={index}>
          <Field label="Role">
            <Dropdown
              disabled={disabled}
              placeholder="Select role…"
              value={member.role}
              selectedOptions={member.role ? [member.role] : []}
              onOptionSelect={(_e, data) =>
                updateRow(index, { role: (data.optionValue as string) ?? '' })
              }
            >
              {TEAM_ROLE_OPTIONS.map((r) => (
                <Option key={r.value} value={r.value} text={r.label}>
                  {r.label}
                </Option>
              ))}
            </Dropdown>
          </Field>

          <PersonPicker
            label="Resource"
            disabled={disabled}
            identityService={identityService}
            value={member.identity}
            onChange={(identity: AzureDevOpsIdentity | null) => updateRow(index, { identity })}
          />

          {!disabled && (
            <Button
              className={styles.remove}
              appearance="subtle"
              icon={<DeleteRegular />}
              aria-label={`Remove team member ${index + 1}`}
              onClick={() => removeRow(index)}
            />
          )}
        </div>
      ))}

      {!disabled && (
        <Button appearance="secondary" icon={<AddRegular />} onClick={addRow}>
          Add team member
        </Button>
      )}
    </div>
  );
}
