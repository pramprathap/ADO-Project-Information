# Veelead Project Information

An Azure DevOps extension that adds a **Project Information** page under
**Project Settings**, letting you maintain structured, **project-scoped** custom
information (client, ownership, timeline, delivery status, commercial and client
details) for each Azure DevOps project.

Every project stores its **own** values. Data is **not** written to work items
(Epics, Features, User Stories, Tasks, Bugs, etc.) and the extension does **not**
create or modify an inherited process. All values are persisted using the
official Azure DevOps **project properties** REST API.

---

## 1. Purpose

Azure DevOps has no native project-level custom fields on the Project Settings
overview. This extension fills that gap with a governed, per-project metadata
form covering identification, ownership, timeline, delivery status, commercial
and client information — stored safely against the project itself.

## 2. Architecture

```
Project Settings ─▶ Project Information (ms.vss-web.hub)
        │
        ▼
   React + TypeScript SPA (single self-contained HTML)
        │
        ├── hooks/          UI state & lifecycle (SDK init, load, search, dirty)
        ├── components/     Fluent UI form, sections, people picker, banners
        ├── services/       Azure DevOps REST access
        │     ├── AzureDevOpsClient   token + fetch + retry + typed errors
        │     ├── ProjectPropertiesService   GET/PATCH project properties
        │     ├── IdentityService            Graph subjectQuery / users
        │     ├── PermissionService          permissions REST check
        │     └── sdkContext                 project + base URLs from SDK
        ├── utils/          validation, propertyMapper, dateUtils, safeUrl, retry
        ├── models/         strongly-typed domain models
        └── constants/      property keys, dropdown options, service ids
```

**Key design points**

- **Storage** — Azure DevOps project properties under the namespace
  `Veelead.ProjectInformation.*`. Only properties in this namespace are read or
  written, so unrelated project properties are never touched.
- **Person fields** — stored as three properties each (Descriptor / DisplayName
  / Email). The **Graph descriptor** is the canonical, stable identifier.
- **Property mapper** — the UI never builds REST patch documents. A dedicated
  mapper serialises/deserialises and computes the minimal JSON-Patch diff.
- **Single-file bundle** — Vite + `vite-plugin-singlefile` inline all JS/CSS
  into one HTML file. Nothing is loaded from a CDN at runtime.
- **Theming** — `SDK.init({ applyTheme: true })` applies the host theme; the app
  maps it onto Fluent UI light / dark / high-contrast themes.

## 3. Prerequisites

- An Azure DevOps organisation where you can install a private extension.
- An Azure DevOps **Marketplace publisher** (see §8).
- Node.js and npm (see §4).
- `tfx-cli` — installed automatically as a dev dependency.

## 4. Required Node.js version

**Node.js 18 or later** (developed and verified on Node 22, npm 10). Enforced via
the `engines` field in `package.json`.

## 5. Installation (development machine)

```bash
npm install
```

## 6. Local development

```bash
npm run dev
```

This starts Vite. Note that the extension calls the Azure DevOps SDK, which only
functions inside the Azure DevOps iframe. For full end-to-end testing, build and
install the extension into a real organisation (§10–§12). Business logic
(validation, mapping, URL safety) is covered by unit tests you can run offline.

## 7. Production build

```bash
npm run build
```

Produces a single self-contained file: `dist/project-information.html`.

## 8. Publisher configuration

1. Create a publisher at <https://marketplace.visualstudio.com/manage>.
2. Open `vss-extension.json` and replace the placeholder:

   ```json
   "publisher": "PLACEHOLDER_PUBLISHER_ID"
   ```

   with your publisher id.

The placeholder appears **only** in `vss-extension.json` (`publisher` field).
`npm run validate:manifest` warns while it is still the placeholder.

You may also adjust `id`, `name`, and `version` in the same file.

## 9. How to package the VSIX

```bash
npm run package
```

The `package` script runs, and **stops on the first failure**:

1. `typecheck` — `tsc --noEmit`
2. `lint` — ESLint (zero warnings allowed)
3. `test` — Vitest unit tests
4. `build` — production build
5. `validate:manifest` — manifest sanity checks
6. packaging — `tfx extension create`

Output: `dist-package/<publisher>.veelead-project-information-<version>.vsix`.

## 10. How to publish privately

```bash
# Option A: upload the VSIX in the Marketplace management portal
#   https://marketplace.visualstudio.com/manage  ->  New extension  ->  Azure DevOps

# Option B: publish from the CLI (requires a Marketplace PAT with Marketplace scope)
npx tfx extension publish \
  --vsix dist-package/<publisher>.veelead-project-information-1.0.0.vsix \
  --token <MARKETPLACE_PAT>
```

The extension is marked `"public": false`, so it is **private** and visible only
to organisations you explicitly share it with.

> The Marketplace PAT is used only by you, at the terminal, for publishing. It is
> **never** stored in the source, and the running extension never uses a PAT.

## 11. How to share it with an Azure DevOps organisation

In the Marketplace management portal, open the extension, choose **Share/Unshare**,
and add your organisation name(s). Only shared organisations can install a private
extension.

## 12. How to install it

1. In your organisation, go to **Organization settings → Extensions → Shared**.
2. Select **Veelead Project Information** and click **Install**.
3. Open any project → **Project Settings** → **Project Information**.

## 13. Required scopes

| Scope               | Why it is needed                                   |
| ------------------- | -------------------------------------------------- |
| `vso.project`       | Read project info and project properties.          |
| `vso.project_write` | Update (PATCH) project properties.                 |
| `vso.graph`         | Search / resolve identities for the people picker. |

These are the **minimum** scopes required. `vso.project_write` implies
`vso.project`; both are listed for clarity. No additional scopes are requested.

## 14. Permission behaviour

- **Viewing** — any user with access to the project can open the page and view
  the information.
- **Editing** — gated by the **"Edit project-level information"** permission
  (the `GENERIC_WRITE` bit on the project security namespace), which Project
  Administrators and Project Collection Administrators hold.
- The client checks this permission via the official **permissions REST API**
  and renders read-only (disabled fields, hidden Save) when the user lacks it.
- **Security is enforced by the server, not the UI.** Hiding the Save button is
  a convenience only; the actual `PATCH` is authorised by Azure DevOps, and
  `401`/`403` responses are handled and surfaced clearly.
- If the client-side permission check itself fails (e.g. transient error), the
  form allows an edit **attempt** and relies on the server to accept or reject
  it, so a legitimate admin is never blocked by a flaky check.

## 15. Project-property keys

All keys are under `Veelead.ProjectInformation.`:

```
SchemaVersion
ClientName, ProjectCode, BusinessUnit
ProjectManager.{Descriptor,DisplayName,Email}
DeliveryManager.{Descriptor,DisplayName,Email}
TechnicalLead.{Descriptor,DisplayName,Email}
ProjectStartDate, PlannedEndDate, ActualEndDate
ProjectStatus, ProjectHealth, CurrentPhase
BillingType, ContractType, PurchaseOrderNumber
ClientContactName, ClientContactEmail, ClientRegion
InternalSponsor.{Descriptor,DisplayName,Email}
TechnologyStack, RepositoryUrl, HostingModel, AdditionalNotes
LastUpdatedAt
LastUpdatedBy.{Descriptor,DisplayName,Email}
```

`SchemaVersion` is set to `1`. Dates are stored as `YYYY-MM-DD`; `LastUpdatedAt`
is an ISO 8601 UTC timestamp.

## 16. Person-field storage design

Each person is stored as three properties: `*.Descriptor`, `*.DisplayName`,
`*.Email`. The **descriptor** (Graph descriptor) is the canonical value; the
display name and email are kept for presentation and to remain meaningful even
if the identity is later removed.

On load, each stored descriptor is re-resolved via the Graph API:

- If the user still exists, the current name/email/avatar are refreshed.
- If the user was removed/disabled (HTTP 404), the stored value is kept and
  flagged **Inactive** in the UI.

The picker searches **server-side** (`graph/subjectquery`) as you type, so the
full organisation user list is never downloaded. Free text cannot be committed —
only a selected identity with a descriptor is accepted. Well-known service /
build accounts are filtered out on a best-effort basis.

## 17. Troubleshooting

| Symptom                               | Likely cause / fix                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| Page shows "Failed to initialize"     | SDK handshake failed — reload; ensure the extension is installed and shared.      |
| "You do not have permission to edit…" | You lack the _Edit project-level information_ permission. Ask a Project Admin.    |
| People search returns nothing         | Ensure the `vso.graph` scope is granted; re-install after any scope change.       |
| Save fails with 403                   | Server denied the update — you are not authorised even though the form was shown. |
| Save fails with 429 / 5xx             | Transient. The client retries reads; retry the save from the UI.                  |
| A person shows as **Inactive**        | The stored user was removed/disabled. Re-select a current user and save.          |
| Fields look wrong in dark mode        | The app follows the host theme automatically; try toggling the ADO theme.         |

Technical details are logged to the browser console. Tokens, headers, and raw
response bodies are **never** shown to users.

## 18. How to upgrade the extension

1. Make changes.
2. Bump the version (§19).
3. `npm run package`.
4. Upload the new VSIX (§10). Shared organisations pick up the update
   automatically (or via **Extensions → Update**).

## 19. How to increment the extension version

Update `version` in **`vss-extension.json`** (and optionally `package.json`).
Use semantic versioning, e.g. `1.0.0` → `1.0.1`. The Marketplace requires the
version to increase for every new upload.

## 20. How to uninstall the extension

**Organization settings → Extensions → Installed →** select the extension **→
Uninstall** (or **Disable** to keep the data but hide the page).

## 21. Data-retention implications when uninstalling

- **Uninstalling / disabling** the extension does **not** delete the stored
  project properties. The `Veelead.ProjectInformation.*` values remain on each
  project and reappear if the extension is reinstalled.
- To remove the data permanently, clear the properties (e.g. via the project
  properties REST API) before or after uninstalling.

## 22. Known limitations

- **On-premises Azure DevOps Server**: base URLs are resolved via the SDK
  location service, with a fallback to `dev.azure.com` / `vssps.dev.azure.com`
  derived from the organisation name. The fallback path assumes Azure DevOps
  **Services**; Server/on-prem collection URLs may differ.
- **Service-account filtering** is best-effort — Azure DevOps exposes no single
  authoritative "is service account" flag.
- **Project-property values are strings**; complex data is stored as text.
- **`beforeunload`** unsaved-changes prompts depend on browser support inside
  the extension iframe and may be suppressed by the host in some cases.
- The client permission check is advisory; the server is the source of truth
  (see §14).

---

## Available scripts

```bash
npm run dev              # Vite dev server
npm run build            # Production build -> dist/project-information.html
npm run lint             # ESLint (zero warnings)
npm run format           # Prettier write
npm run format:check     # Prettier check
npm run typecheck        # tsc --noEmit
npm run test             # Vitest unit tests
npm run test:coverage    # Vitest with coverage
npm run validate:manifest# Manifest checks
npm run package          # typecheck + lint + test + build + validate + VSIX
npm run clean            # Remove dist/ and dist-package/
npm run icons            # Regenerate the extension icon
```

## Security summary

- No PAT is used or stored by the extension; the SDK access token is used and
  never logged or persisted.
- No secrets in the repository; `.env*` and `*.pat` are git-ignored.
- URLs are validated (HTTPS only for links) to prevent `javascript:` / `data:`
  injection; user-controlled values are rendered via React (escaped).
- Minimum scopes; dependencies bundled (no runtime CDN); no `eval`.
# ADO-Project-Information
