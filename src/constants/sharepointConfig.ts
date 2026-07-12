/**
 * SharePoint (LMS + Timesheet) integration settings.
 *
 * The report reads the two SharePoint sources via Microsoft Graph using the
 * signed-in user's identity (MSAL, delegated `Sites.Read.All`). That requires a
 * one-time Entra ID app registration in the veeleadsolutions tenant:
 *
 *   1. Entra admin center → App registrations → New registration
 *      (e.g. "Veelead Project Tracker – SharePoint reader").
 *   2. Supported account types: single tenant.
 *   3. Authentication → Add a platform → **Single-page application** and add
 *      the extension origin(s) as redirect URIs. The exact origin is shown in
 *      the "Connect SharePoint" banner on the Resource Allocation page
 *      (it is the iframe origin, e.g. https://pramprathap.gallerycdn.vsassets.io).
 *   4. API permissions → Microsoft Graph → Delegated → `Sites.Read.All`
 *      → Grant admin consent.
 *   5. Paste the Application (client) ID below and rebuild/republish.
 *
 * Leaving `clientId` empty keeps the providers disconnected (UI shows
 * "LMS connection pending") without breaking anything else.
 */
export const SHAREPOINT_CONFIG = {
  /** Application (client) ID of the SPA app registration. Empty = disabled. */
  clientId: '',
  /** AAD authority; 'organizations' works for any signed-in work account. */
  authority: 'https://login.microsoftonline.com/organizations',
  /** SharePoint hostname. */
  host: 'veeleadsolutions.sharepoint.com',
  /** Server-relative path of the LMS site (list: LMS_LeaveTransaction). */
  lmsSitePath: '/sites/Data/LMS',
  leaveListName: 'LMS_LeaveTransaction',
  /** Server-relative path of the Timesheet site (lists: Timesheet, Timesheet Entries). */
  timesheetSitePath: '/sites/TimesheetPro',
  timesheetListName: 'Timesheet',
} as const;
