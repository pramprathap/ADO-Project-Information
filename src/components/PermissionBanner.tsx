import { MessageBar, MessageBarBody, MessageBarTitle } from '@fluentui/react-components';

interface PermissionBannerProps {
  canEdit: boolean;
  checkFailed: boolean;
}

export function PermissionBanner({ canEdit, checkFailed }: PermissionBannerProps) {
  if (canEdit && !checkFailed) {
    return null;
  }

  if (!canEdit) {
    return (
      <MessageBar intent="info">
        <MessageBarBody>
          <MessageBarTitle>Read-only</MessageBarTitle>
          You do not have permission to edit project information. Contact a Project Administrator to
          request the &ldquo;Edit project-level information&rdquo; permission.
        </MessageBarBody>
      </MessageBar>
    );
  }

  // canEdit && checkFailed
  return (
    <MessageBar intent="warning">
      <MessageBarBody>
        <MessageBarTitle>Permission check unavailable</MessageBarTitle>
        We could not verify your edit permission. You may attempt to save; Azure DevOps will reject
        the change if you are not authorized.
      </MessageBarBody>
    </MessageBar>
  );
}
