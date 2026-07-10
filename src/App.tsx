import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as SDK from 'azure-devops-extension-sdk';
import {
  Button,
  Divider,
  FluentProvider,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { SaveRegular, ArrowUndoRegular } from '@fluentui/react-icons';
import { useAdoTheme } from '@/hooks/useAdoTheme';
import { useProjectContext } from '@/hooks/useProjectContext';
import { useProjectInformation } from '@/hooks/useProjectInformation';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import type { AppServices } from '@/services/appServices';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { PermissionBanner } from '@/components/PermissionBanner';
import { Hero } from '@/components/Hero';
import { StatStrip } from '@/components/StatStrip';
import { Column, Columns, FormSection, FullWidthField } from '@/components/FormSection';
import {
  DateField,
  DropdownField,
  ReadOnlyStat,
  TextAreaField,
  TextField,
} from '@/components/FormFields';
import { PersonPicker } from '@/components/PersonPicker';
import {
  IdentificationGlyph,
  OwnershipGlyph,
  TimelineGlyph,
  StatusGlyph,
  MailGlyph,
  CodeGlyph,
} from '@/components/icons';
import type { ProjectInformation } from '@/models/ProjectInformation';
import type { ValidationField } from '@/models/ValidationResult';
import {
  BILLING_TYPE_OPTIONS,
  CLIENT_REGION_OPTIONS,
  HOSTING_MODEL_OPTIONS,
  PROJECT_HEALTH_OPTIONS,
  PROJECT_PHASE_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  REPOSITORY_SOURCE_OPTIONS,
} from '@/constants/dropdownOptions';
import { FieldLimits } from '@/constants/propertyKeys';
import { firstInvalidField, validateProjectInformation, FIELD_ORDER } from '@/utils/validation';
import { formatTimestampForDisplay } from '@/utils/dateUtils';

const useStyles = makeStyles({
  root: {
    width: '100%',
    maxWidth: '1500px',
    boxSizing: 'border-box',
    margin: '0 auto',
    padding: `${tokens.spacingVerticalL} clamp(16px, 4vw, 44px) 40px`,
  },
  subtle: { color: tokens.colorNeutralForeground3 },
  banners: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    marginBottom: tokens.spacingVerticalM,
  },
  footer: {
    position: 'sticky',
    bottom: tokens.spacingVerticalM,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    marginTop: tokens.spacingVerticalL,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: '14px',
    backgroundColor: 'var(--pi-glass)',
    backdropFilter: 'blur(12px)',
    boxShadow: 'var(--pi-shadow-md)',
    flexWrap: 'wrap',
  },
  spacer: { flex: 1 },
});

export function App() {
  const theme = useAdoTheme();
  const { status, services, error, retry } = useProjectContext();

  return (
    <FluentProvider theme={theme} style={{ backgroundColor: 'transparent' }}>
      {status === 'initializing' && <LoadingState label="Initializing…" />}
      {status === 'error' && (
        <ErrorState
          title="Failed to initialize"
          message={error ?? 'The extension could not start.'}
          onRetry={retry}
        />
      )}
      {status === 'ready' && services && <ProjectForm services={services} />}
    </FluentProvider>
  );
}

function ProjectForm({ services }: { services: AppServices }) {
  const styles = useStyles();
  const {
    loadStatus,
    loadError,
    info,
    setInfo,
    isDirty,
    permission,
    saveStatus,
    saveError,
    clearSaveStatus,
    save,
    reload,
    resetChanges,
  } = useProjectInformation(services);

  const [touched, setTouched] = useState<Set<ValidationField>>(new Set());
  const notified = useRef(false);

  useUnsavedChanges(isDirty && permission.canEdit);

  // Notify the host exactly once the page has finished its initial load
  // (successfully rendered content, whether data loaded or a retryable error).
  useEffect(() => {
    if (!notified.current && loadStatus !== 'loading') {
      notified.current = true;
      // In local preview mode the SDK is not initialized; skip the host notify.
      if (!import.meta.env.DEV) {
        void SDK.notifyLoadSucceeded();
      }
    }
  }, [loadStatus]);

  const validation = useMemo(() => validateProjectInformation(info), [info]);
  const readOnly = !permission.canEdit;

  const markTouched = useCallback((field: ValidationField) => {
    setTouched((prev) => {
      if (prev.has(field)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  }, []);

  const update = useCallback(
    <K extends keyof ProjectInformation>(
      field: K,
      value: ProjectInformation[K],
      validationField?: ValidationField,
    ) => {
      setInfo((prev) => ({ ...prev, [field]: value }));
      if (validationField) {
        markTouched(validationField);
      }
    },
    [setInfo, markTouched],
  );

  const errorFor = (field: ValidationField): string | undefined =>
    touched.has(field) ? validation.errors[field] : undefined;

  const warningFor = (field: ValidationField): string | undefined => validation.warnings[field];

  const handleSave = useCallback(async () => {
    // Reveal all validation messages and refuse to send an invalid form.
    if (!validation.isValid) {
      setTouched(new Set(FIELD_ORDER));
      const first = firstInvalidField(validation);
      if (first) {
        const el = document.getElementById(first);
        el?.focus();
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      return;
    }
    await save();
  }, [validation, save]);

  if (loadStatus === 'loading') {
    return <LoadingState />;
  }

  if (loadStatus === 'error') {
    return (
      <ErrorState
        title="Could not load project information"
        message={loadError ?? 'An error occurred.'}
        onRetry={reload}
      />
    );
  }

  const saving = saveStatus === 'saving';
  const canSave = !readOnly && isDirty && !saving;

  return (
    <div className={styles.root}>
      <Hero projectName={services.context.project.name} info={info} />

      <div className={styles.banners}>
        <PermissionBanner canEdit={permission.canEdit} checkFailed={permission.checkFailed} />

        {saveStatus === 'success' && (
          <MessageBar intent="success" politeness="polite">
            <MessageBarBody>
              <MessageBarTitle>Saved</MessageBarTitle>
              Project information was saved successfully.
            </MessageBarBody>
          </MessageBar>
        )}

        {saveStatus === 'error' && saveError && (
          <MessageBar intent="error" politeness="assertive">
            <MessageBarBody>
              <MessageBarTitle>Save failed</MessageBarTitle>
              {saveError}
            </MessageBarBody>
          </MessageBar>
        )}

        {isDirty && !validation.isValid && (
          <MessageBar intent="warning" politeness="polite">
            <MessageBarBody>
              <MessageBarTitle>
                {Object.keys(validation.errors).length} field
                {Object.keys(validation.errors).length === 1 ? '' : 's'} need attention
              </MessageBarTitle>
              Resolve the highlighted fields to enable saving.
            </MessageBarBody>
          </MessageBar>
        )}

        {isDirty && permission.canEdit && (
          <MessageBar intent="info" politeness="polite">
            <MessageBarBody>You have unsaved changes.</MessageBarBody>
          </MessageBar>
        )}
      </div>

      <StatStrip info={info} />

      <Columns>
        <Column>
          {/* Project Identification */}
          <FormSection
            title="Project Identification"
            caption="Who the work is for"
            glyph={<IdentificationGlyph />}
            tint="blue"
          >
            <TextField
              fieldId="clientName"
              label="Client Name"
              required
              disabled={readOnly}
              value={info.clientName}
              maxLength={FieldLimits.ClientName}
              error={errorFor('clientName')}
              onChange={(v) => update('clientName', v, 'clientName')}
            />
            <DropdownField
              fieldId="projectType"
              label="Project Type"
              disabled={readOnly}
              allowEmpty
              value={info.projectType ?? ''}
              options={PROJECT_TYPE_OPTIONS}
              error={errorFor('projectType')}
              onChange={(v) => update('projectType', v || undefined, 'projectType')}
            />
            <DropdownField
              fieldId="clientRegion"
              label="Client Region"
              required
              disabled={readOnly}
              value={info.clientRegion}
              options={CLIENT_REGION_OPTIONS}
              error={errorFor('clientRegion')}
              onChange={(v) => update('clientRegion', v, 'clientRegion')}
            />
            <DropdownField
              fieldId="billingType"
              label="Billing Type"
              disabled={readOnly}
              allowEmpty
              value={info.billingType ?? ''}
              options={BILLING_TYPE_OPTIONS}
              error={errorFor('billingType')}
              onChange={(v) => update('billingType', v || undefined, 'billingType')}
            />
          </FormSection>

          {/* Delivery Status */}
          <FormSection
            title="Delivery Status"
            caption="Where the project stands today"
            glyph={<StatusGlyph />}
            tint="green"
          >
            <DropdownField
              fieldId="projectStatus"
              label="Project Status"
              required
              disabled={readOnly}
              value={info.projectStatus}
              options={PROJECT_STATUS_OPTIONS}
              error={errorFor('projectStatus')}
              onChange={(v) => update('projectStatus', v, 'projectStatus')}
            />
            <DropdownField
              fieldId="projectHealth"
              label="Project Health"
              required
              disabled={readOnly}
              value={info.projectHealth}
              options={PROJECT_HEALTH_OPTIONS}
              error={errorFor('projectHealth')}
              onChange={(v) => update('projectHealth', v, 'projectHealth')}
            />
            <DropdownField
              fieldId="currentPhase"
              label="Current Phase"
              disabled={readOnly}
              allowEmpty
              value={info.currentPhase ?? ''}
              options={PROJECT_PHASE_OPTIONS}
              error={errorFor('currentPhase')}
              onChange={(v) => update('currentPhase', v || undefined, 'currentPhase')}
            />
          </FormSection>

          {/* Project Ownership */}
          <FormSection
            title="Project Ownership"
            caption="Accountable people (Azure DevOps identities)"
            glyph={<OwnershipGlyph />}
            tint="violet"
          >
            <PersonPicker
              fieldId="projectManager"
              label="Project Manager / Project Lead"
              disabled={readOnly}
              identityService={services.identities}
              value={info.projectManager}
              validationMessage={errorFor('projectManager')}
              onChange={(id) => update('projectManager', id, 'projectManager')}
            />
            <PersonPicker
              fieldId="deliveryManager"
              label="Delivery Manager"
              required
              disabled={readOnly}
              identityService={services.identities}
              value={info.deliveryManager}
              validationMessage={errorFor('deliveryManager')}
              onChange={(id) => update('deliveryManager', id, 'deliveryManager')}
            />
            <PersonPicker
              fieldId="technicalLead"
              label="Technical Lead"
              disabled={readOnly}
              identityService={services.identities}
              value={info.technicalLead}
              validationMessage={errorFor('technicalLead')}
              onChange={(id) => update('technicalLead', id, 'technicalLead')}
            />
            <PersonPicker
              fieldId="internalSponsor"
              label="Internal Sponsor"
              disabled={readOnly}
              identityService={services.identities}
              value={info.internalSponsor}
              validationMessage={errorFor('internalSponsor')}
              onChange={(id) => update('internalSponsor', id, 'internalSponsor')}
            />
          </FormSection>

          {/* Client Contact */}
          <FormSection
            title="Client Contact"
            caption="Primary point of contact"
            glyph={<MailGlyph />}
            tint="amber"
          >
            <TextField
              fieldId="clientContactName"
              label="Client Contact Name"
              disabled={readOnly}
              value={info.clientContactName ?? ''}
              maxLength={FieldLimits.ClientContactName}
              error={errorFor('clientContactName')}
              onChange={(v) => update('clientContactName', v, 'clientContactName')}
            />
            <TextField
              fieldId="clientContactEmail"
              label="Client Contact Email"
              type="email"
              disabled={readOnly}
              value={info.clientContactEmail ?? ''}
              maxLength={FieldLimits.ClientContactEmail}
              error={errorFor('clientContactEmail')}
              onChange={(v) => update('clientContactEmail', v, 'clientContactEmail')}
            />
          </FormSection>
        </Column>

        <Column>
          {/* Timeline */}
          <FormSection
            title="Timeline"
            caption="Key delivery dates"
            glyph={<TimelineGlyph />}
            tint="teal"
          >
            <DateField
              fieldId="projectStartDate"
              label="Project Start Date"
              required
              disabled={readOnly}
              value={info.projectStartDate}
              error={errorFor('projectStartDate')}
              onChange={(v) => update('projectStartDate', v, 'projectStartDate')}
            />
            <DateField
              fieldId="plannedEndDate"
              label="Planned End Date"
              disabled={readOnly}
              value={info.plannedEndDate ?? ''}
              error={errorFor('plannedEndDate')}
              onChange={(v) => update('plannedEndDate', v, 'plannedEndDate')}
            />
            <DateField
              fieldId="actualEndDate"
              label="Actual / Revised End Date"
              disabled={readOnly}
              value={info.actualEndDate ?? ''}
              error={errorFor('actualEndDate')}
              hint={warningFor('actualEndDate')}
              onChange={(v) => update('actualEndDate', v, 'actualEndDate')}
            />
            <ReadOnlyStat
              label="Timeline Revisions"
              value={String(info.endDateRevisionCount)}
              caption="Times the end date has been revised on save"
            />
          </FormSection>

          {/* Technical Information */}
          <FormSection
            title="Technical Information"
            caption="Repository, hosting and stack"
            glyph={<CodeGlyph />}
            tint="blue"
          >
            <DropdownField
              fieldId="repositorySource"
              label="Repository Source"
              disabled={readOnly}
              allowEmpty
              value={info.repositorySource ?? ''}
              options={REPOSITORY_SOURCE_OPTIONS}
              error={errorFor('repositorySource')}
              onChange={(v) => update('repositorySource', v || undefined, 'repositorySource')}
            />
            <FullWidthField>
              <TextField
                fieldId="repositoryUrl"
                label="Repository URL"
                type="url"
                disabled={readOnly}
                value={info.repositoryUrl ?? ''}
                maxLength={FieldLimits.RepositoryUrl}
                placeholder="https://dev.azure.com/org/project/_git/repo"
                hint="Must start with https:// (SSH git remotes are also accepted)."
                error={errorFor('repositoryUrl')}
                onChange={(v) => update('repositoryUrl', v, 'repositoryUrl')}
              />
            </FullWidthField>
            <DropdownField
              fieldId="hostingModel"
              label="Hosting Model"
              disabled={readOnly}
              allowEmpty
              value={info.hostingModel ?? ''}
              options={HOSTING_MODEL_OPTIONS}
              error={errorFor('hostingModel')}
              onChange={(v) => update('hostingModel', v || undefined, 'hostingModel')}
            />
            <FullWidthField>
              <TextAreaField
                fieldId="technologyStack"
                label="Technology Stack"
                disabled={readOnly}
                value={info.technologyStack ?? ''}
                maxLength={FieldLimits.TechnologyStack}
                placeholder="e.g. .NET 8, React, Azure SQL, Kubernetes"
                error={errorFor('technologyStack')}
                onChange={(v) => update('technologyStack', v, 'technologyStack')}
              />
            </FullWidthField>
            <FullWidthField>
              <TextAreaField
                fieldId="additionalNotes"
                label="Additional Notes"
                disabled={readOnly}
                rows={5}
                value={info.additionalNotes ?? ''}
                maxLength={FieldLimits.AdditionalNotes}
                error={errorFor('additionalNotes')}
                onChange={(v) => update('additionalNotes', v, 'additionalNotes')}
              />
            </FullWidthField>
          </FormSection>
        </Column>
      </Columns>

      <Divider />
      <Text size={200} className={styles.subtle} style={{ display: 'block', marginTop: 12 }}>
        {info.lastUpdatedAt
          ? `Last updated ${formatTimestampForDisplay(info.lastUpdatedAt)}${
              info.lastUpdatedBy ? ` by ${info.lastUpdatedBy.displayName}` : ''
            }.`
          : 'This project has no saved information yet.'}
      </Text>

      {!readOnly && (
        <div className={styles.footer}>
          <Button
            appearance="primary"
            icon={saving ? <Spinner size="tiny" /> : <SaveRegular />}
            disabled={!canSave}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button
            appearance="secondary"
            icon={<ArrowUndoRegular />}
            disabled={!isDirty || saving}
            onClick={() => {
              resetChanges();
              setTouched(new Set());
              clearSaveStatus();
            }}
          >
            Reset changes
          </Button>
          <div className={styles.spacer} />
          {isDirty && <Text className={styles.subtle}>Unsaved changes</Text>}
        </div>
      )}
    </div>
  );
}
