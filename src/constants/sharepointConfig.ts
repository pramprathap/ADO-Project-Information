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
  clientId: 'a2b37797-a48f-4341-abec-aee5359ab583',
  /** AAD authority — single-tenant app ("My organization only"), so pin the tenant. */
  authority: 'https://login.microsoftonline.com/dada034a-421f-40dd-90b4-98e44386f293',
  /** SharePoint hostname. */
  host: 'veeleadsolutions.sharepoint.com',
  /** Server-relative path of the LMS site (list: LMS_LeaveTransaction). */
  lmsSitePath: '/sites/Data/LMS',
  /**
   * Optional explicit Graph site id (host,siteGuid,webGuid) — takes precedence
   * over the path. Get it via Graph Explorer:
   * GET https://graph.microsoft.com/v1.0/sites/veeleadsolutions.sharepoint.com:/sites/Data/LMS
   */
  lmsSiteId:
    'veeleadsolutions.sharepoint.com,15f37e46-d9b9-4b61-9415-3ccd9e51916b,19d6bc4d-78a8-4e53-981e-6c6ac5508779',
  leaveListName: 'LMS_LeaveTransaction',
  /** Server-relative path of the Timesheet site (lists: Timesheet, Timesheet Entries). */
  timesheetSitePath: '/sites/TimesheetPro',
  /** Optional explicit Graph site id for the Timesheet site (see above). */
  timesheetSiteId:
    'veeleadsolutions.sharepoint.com,172db5db-2756-4bfa-87fa-73313636063e,3ca959ce-a3ab-4da1-91d6-812118152777',
  timesheetListName: 'Timesheet',
  /**
   * Employee roster list on the TimesheetPro site. Used to restrict the
   * resource views to currently-employed people: only rows whose
   * `EmployeeStatus` = "Active" are shown (Inactive employees are hidden).
   * Columns: Employee (person/text), EmployeeStatus (choice Active/Inactive).
   */
  employeeListName: 'EmployeeList',
} as const;
