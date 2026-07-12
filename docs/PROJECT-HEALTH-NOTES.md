# Project Health report — domain logic notes

Captured from the product owner. Used to build the report phases.

## Epic scoping & milestone visibility (v1.1.3+)

- Every **Epic** in the project renders as a tile in the **Epics selector**. Each
  Epic reports its own **lead** (custom "Lead" identity field, else Assigned To),
  **board state**, **Go-Live** and **open blockers / clarifications** (rolled up
  from descendant Blocker / Clarifications work items).
- Epics carry a custom **"EPIC Type"** field. The **Key Milestones** phase
  timeline is shown **only for Development-type Epics** (`EPIC Type` matches
  `/develop/i`). Non-Development Epics are **"Continuous / Activity-based"** — no
  phase timeline is rendered at all (the card is hidden).
- Multi-Epic projects: the selected Epic drives the milestone timeline + its
  open items. Default selection = the first Development Epic.
- **Project-level fallback**: when there are no Development Epics, the timeline is
  built from all Features **only if** the project's Project Information
  **"Current Phase"** (or **"Project Type"**) is Development (`/develop/i`). The
  hook passes `currentPhase` / `projectType` into `getReport({...})`.
- Milestone timeline: **arrow** connectors between consecutive phases up to and
  including **Sign-Off** (the Epic's target date); **no line after the last
  node**. Revised dates render in a distinct (warn) colour with a "Revised ×N"
  label. No horizontal scrollbar.

## Open Items / Blockers / Clarifications (v1.1.4+)

- Actual custom WIT names are **"Blocker"** and **"Clarifications"** (the earlier
  "Open Items" naming is kept as a fallback). `kind` is derived: `/clarif/i` →
  Clarification, else Blocker.
- Both carry a custom **"Raised To"** field (Text, single line) with free-text
  values like **"Client"** / **"Internal"** / a client name ("Summit"). Resolved
  by display name via `_apis/wit/fields` and shown as a coloured tag.

## Work items tree (v1.1.5+)

- Rendered as a **collapsible / expandable tree**: Feature → User Story →
  Task / Bug / Issue, indented by depth, with per-row chevron toggles and an
  Expand-all / Collapse-all control. Tree is built from `System.Parent`.

## Key Milestones (from Features)

- Milestones come from **Feature** work items. Each Feature has a **custom field
  "Feature Type"** (Work item → Classification section).
- Feature Type values (the milestone track, in order):
  1. Requirement
  2. Development
  3. QC
  4. UAT
  5. Go Live
  6. Post Production
  - (Board also shows "Training & Handover" and "Open Items" as Feature Types.)
- Each Feature has:
  - **Start Date** (`System`/`Microsoft.VSTS.Scheduling.StartDate`)
  - **Target Date** (`Microsoft.VSTS.Scheduling.TargetDate`) = expected completion
  - **Revised Target Date** (custom field) — set when the date is pushed
  - **Revised Date Count** (custom field) — number of times revised
- Milestone display:
  - Show each Feature-Type milestone with its target date.
  - **Overdue** if target date is in the past (and not completed).
  - If the date was **revised**, show it in a **different colour** and show the
    **revision count** (from Revised Date Count).

## Open Items (split feature)

- A Feature with **Feature Type = "Open Items"** groups the open items.
- Classification is by **custom Work Item Type**, not tags:
  - **"Open Items"** — a custom WIT (e.g. "User Onboarding Naming & UPN",
    "User Onboarding - Password"). These are children of the Open Items Feature.
  - **"Clarifications"** — a custom WIT (e.g. "Define all the onboarding
    activities", "Who in HR can submit onboarding requests?"). Typically children
    of an Open Items work item.
- So the Open Items panel = work items where
  `[System.WorkItemType] IN ('Open Items', 'Clarifications')`.
- Expected columns (from the design): ID, type, description/title, raised-to,
  owner, status, age (days since created).

## Implementation notes / TODO

- The three custom fields ("Feature Type", "Revised Target Date", "Revised Date
  Count") are **process-specific custom fields**; their reference names are not
  the well-known `Microsoft.VSTS.*` names. Resolve reference names at runtime via
  `GET _apis/wit/fields` (match by field `name`) rather than hard-coding, and
  degrade gracefully (hide the panel) if a field is not present in the project's
  process.
- Milestone ordering should follow the fixed sequence above, not creation order.
- Overdue baseline in the mock design was "past 24 Jun 2026" — use today's date
  at runtime.
