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
import { Column, FormSection, FullWidthField, Sections } from '@/components/FormSection';
import { ProjectTeam } from '@/components/ProjectTeam';
import { ClientContactsEditor } from '@/components/ClientContactsEditor';
import { ProjectHealthPage } from '@/components/health/ProjectHealthPage';
import { OrganizationHealthPage } from '@/components/health/OrganizationHealthPage';
import { OverviewPage } from '@/components/portfolio/OverviewPage';
import { ResourceAllocationPage } from '@/components/portfolio/ResourceAllocationPage';
import { EffortTimesheetPage } from '@/components/portfolio/EffortTimesheetPage';
import { WeeklyStatusPage } from '@/components/portfolio/WeeklyStatusPage';
import {
  DateField,
  DropdownField,
  ReadOnlyStat,
  TextAreaField,
  TextField,
  TextSuggestField,
} from '@/components/FormFields';
import { PersonPicker } from '@/components/PersonPicker';
import {
  IdentificationGlyph,
  OwnershipGlyph,
  TimelineGlyph,
  StatusGlyph,
  MailGlyph,
  CodeGlyph,
  TeamGlyph,
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
    boxSizing: 'border-box',
    margin: 0,
    padding: `${tokens.spacingVerticalL} clamp(16px, 3vw, 40px) 40px`,
  },
  subtle: { color: tokens.colorNeutralForeground3 },
  banners: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    marginBottom: tokens.spacingVerticalM,
  },
  footer: {
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

/** Running extension version, shown in the footer so the loaded build is obvious. */
function getExtensionVersion(): string {
  if (import.meta.env.DEV) {
    return 'dev';
  }
  try {
    return SDK.getExtensionContext()?.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Which page to render. Both the "Project Information" and "Project Health"
 * hubs load this same bundle; the active contribution id decides the page. In
 * local preview, `?page=health` selects the report.
 */
type ActivePage = 'info' | 'health' | 'org' | 'overview' | 'resource' | 'effort' | 'weekly';

function pageFromContributionId(id: string): ActivePage {
  if (id.endsWith('organization-overview-hub')) return 'overview';
  if (id.endsWith('organization-resource-hub')) return 'resource';
  if (id.endsWith('organization-effort-hub')) return 'effort';
  if (id.endsWith('organization-weekly-hub')) return 'weekly';
  if (id.endsWith('organization-health-hub')) return 'org';
  return id.endsWith('project-health-hub') ? 'health' : 'info';
}

/**
 * Resolve which page to render. The contribution id is only available after the
 * SDK handshake, so this waits for SDK.ready() before deciding — otherwise an
 * org-level hub would briefly (and wrongly) bootstrap the project-scoped page
 * and fail with "No project context". SDK.init is idempotent; the page
 * components' own init/ready calls resolve immediately afterwards.
 */
function usePage(): ActivePage | null {
  const [page, setPage] = useState<ActivePage | null>(null);
  useEffect(() => {
    if (import.meta.env.DEV) {
      const p = new URLSearchParams(window.location.search).get('page');
      setPage(
        p === 'health' ||
          p === 'org' ||
          p === 'overview' ||
          p === 'resource' ||
          p === 'effort' ||
          p === 'weekly'
          ? p
          : 'info',
      );
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await SDK.init({ loaded: false, applyTheme: true });
        await SDK.ready();
        if (!cancelled) {
          const resolved = pageFromContributionId(SDK.getContributionId() ?? '');
          setPage(resolved);
          // Tell the host the frame is alive NOW so its own round spinner and
          // "taking longer than expected" banner never linger — our branded
          // loaders render immediately and take over for the data load.
          void SDK.notifyLoadSucceeded();
        }
      } catch (err) {
        console.error('Failed to resolve the active page.', err);
        if (!cancelled) setPage('info');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return page;
}

export function App() {
  const theme = useAdoTheme();
  const page = usePage();

  return (
    <FluentProvider theme={theme} style={{ backgroundColor: 'transparent' }}>
      {page === null ? (
        <LoadingState label="Initializing…" />
      ) : page === 'overview' ? (
        <OverviewPage />
      ) : page === 'resource' ? (
        <ResourceAllocationPage />
      ) : page === 'effort' ? (
        <EffortTimesheetPage />
      ) : page === 'weekly' ? (
        <WeeklyStatusPage />
      ) : page === 'org' ? (
        <OrganizationHealthPage />
      ) : (
        <ProjectApp page={page === 'health' ? 'health' : 'info'} />
      )}
    </FluentProvider>
  );
}

/** Project-scoped bootstrap (Project Information + Project Health hubs). */
function ProjectApp({ page }: { page: 'info' | 'health' }) {
  const { status, services, error, retry } = useProjectContext();
  const notified = useRef(false);

  // Tell the host the page has loaded as soon as the context is ready. Without
  // this the host keeps its loading overlay on top of our content ("taking
  // longer than expected"). Skipped in local preview where the SDK is absent.
  useEffect(() => {
    if (!notified.current && status !== 'initializing') {
      notified.current = true;
      if (!import.meta.env.DEV) {
        void SDK.notifyLoadSucceeded();
      }
    }
  }, [status]);

  return (
    <>
      {status === 'initializing' && <LoadingState label="Initializing…" />}
      {status === 'error' && (
        <ErrorState
          title="Failed to initialize"
          message={error ?? 'The extension could not start.'}
          onRetry={retry}
        />
      )}
      {status === 'ready' &&
        services &&
        (page === 'health' ? (
          <ProjectHealthPage services={services} />
        ) : (
          <ProjectForm services={services} />
        ))}
    </>
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
    isAdmin,
    clientNameSuggestions,
    saveStatus,
    saveError,
    clearSaveStatus,
    save,
    reload,
    resetChanges,
  } = useProjectInformation(services);

  const [touched, setTouched] = useState<Set<ValidationField>>(new Set());

  useUnsavedChanges(isDirty && isAdmin);

  const validation = useMemo(() => validateProjectInformation(info), [info]);
  // Only Project Administrators may edit. Non-admins get a fully read-only form
  // (Save/Reset disabled). Editing is additionally enforced server-side on save.
  const readOnly = !isAdmin;

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
        <PermissionBanner canEdit={isAdmin} checkFailed={false} />

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

        {isDirty && isAdmin && (
          <MessageBar intent="info" politeness="polite">
            <MessageBarBody>You have unsaved changes.</MessageBarBody>
          </MessageBar>
        )}
      </div>

      <StatStrip info={info} />

      <Sections>
        <Column>
          {/* Project Identification */}
          <FormSection
            title="Project Identification"
            caption="Who the work is for"
            glyph={<IdentificationGlyph />}
            tint="blue"
          >
            <TextSuggestField
              fieldId="clientName"
              label="Client Name"
              required
              disabled={readOnly}
              value={info.clientName}
              suggestions={clientNameSuggestions}
              maxLength={FieldLimits.ClientName}
              placeholder="Select an existing client or type a new one"
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

          {/* Client Contact */}
          <FormSection
            title="Client Contact"
            caption="Up to three client-side contacts and the sponsor"
            glyph={<MailGlyph />}
            tint="amber"
          >
            {isAdmin ? (
              <>
                <ClientContactsEditor
                  value={info.clientContacts}
                  disabled={readOnly}
                  error={errorFor('clientContacts')}
                  onChange={(contacts) => update('clientContacts', contacts, 'clientContacts')}
                />
                <FullWidthField>
                  <TextField
                    fieldId="clientSponsor"
                    label="Client Sponsor"
                    disabled={readOnly}
                    value={info.clientSponsor ?? ''}
                    maxLength={200}
                    placeholder="Client-side sponsor name"
                    error={errorFor('clientSponsor')}
                    onChange={(v) => update('clientSponsor', v, 'clientSponsor')}
                  />
                </FullWidthField>
              </>
            ) : (
              <FullWidthField>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: '1px dashed var(--pi-neutral-swatch)',
                    color: 'var(--pi-neutral-swatch)',
                  }}
                >
                  <span aria-hidden style={{ fontSize: 16 }}>
                    🔒
                  </span>
                  <span>Client contact details are visible to project administrators only.</span>
                </div>
              </FullWidthField>
            )}
          </FormSection>
        </Column>

        <Column>
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

          {/* Project Team */}
          <FormSection
            title="Project Team"
            caption="Add the people working on this project and their roles"
            glyph={<TeamGlyph />}
            tint="violet"
          >
            <ProjectTeam
              value={info.team}
              disabled={readOnly}
              identityService={services.identities}
              error={errorFor('team')}
              onChange={(team) => update('team', team, 'team')}
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
      </Sections>

      <Divider />
      <Text size={200} className={styles.subtle} style={{ display: 'block', marginTop: 12 }}>
        {info.lastUpdatedAt
          ? `Last updated ${formatTimestampForDisplay(info.lastUpdatedAt)}${
              info.lastUpdatedBy ? ` by ${info.lastUpdatedBy.displayName}` : ''
            }.`
          : 'This project has no saved information yet.'}
        {` · Extension v${getExtensionVersion()}`}
      </Text>

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
          disabled={readOnly || !isDirty || saving}
          onClick={() => {
            resetChanges();
            setTouched(new Set());
            clearSaveStatus();
          }}
        >
          Reset changes
        </Button>
        <div className={styles.spacer} />
        {readOnly ? (
          <Text className={styles.subtle}>Read-only — project administrators can edit.</Text>
        ) : (
          isDirty && <Text className={styles.subtle}>Unsaved changes</Text>
        )}
      </div>
    </div>
  );
}
