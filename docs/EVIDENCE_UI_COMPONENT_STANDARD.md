# Evidence UI Component Standard

## Purpose

This document is the baseline for Evidence frontend UX, UI components, routing surfaces, styling, accessibility, and multilingual support. New Evidence UI work should follow this standard unless a product requirement explicitly calls for a different pattern.

The Evidence app is a legal evidence workbench. It should feel calm, trustworthy, fast, and task-focused. The UI should help users understand what is available, what is still processing, what needs review, and what action is safe to take next.

## Design Principles

### Simplicity

- Prefer one clear primary action per surface.
- Keep operator-only diagnostics out of customer flows unless support mode or an operations role is active.
- Avoid decorative UI that does not help a user decide, verify, upload, search, or recover.
- Hide unavailable features behind role gates or clear staged states instead of filling pages with disabled controls.

### Consistency

- Use shared Evidence components before creating one-off markup:
  - `PageHeader` for page title, description, and page-level actions.
  - `StatusBadge` for state labels.
  - `MetricTile` for numeric summary blocks.
  - `DataTable` for tabular data and mobile table cards.
  - `EmptyState` for no-data and first-run states.
  - `ErrorPanel` for request failures.
  - Existing drawer patterns for detail, support, and citation panels.
- Keep route pages inside `EvidenceLayout` unless the route is intentionally public, such as login or invite splash.
- Keep navigation groups stable: Workspace, Review, Operations, Administration.
- Use the same words for the same action across the app. For example, do not mix "Add Documents", "Upload Evidence", and "Import Files" unless the actions are meaningfully different.

### Visual Hierarchy

- Every page starts with `PageHeader`.
- Page headers should answer: where am I, what is this for, what can I do now?
- Use summary tiles for quick scan metrics; use tables for evidence records; use drawers for focused details.
- Put customer actions before diagnostics. Diagnostics can appear below the main workflow or behind support/operator mode.
- Keep headings compact inside workbench panels. Reserve larger type for route-level page titles.

### Feedback And Responsiveness

- Every API-triggered button needs an obvious loading, disabled, success, or failure state.
- Long-running work should point to a job, request fingerprint, or next diagnostic action when available.
- Tables and drawers should show loading and empty states without layout jumps.
- Never leave a user on a bare `Failed to fetch` style message without recovery actions.

### Accessibility

- All icon-only buttons need an `aria-label` and preferably a `title`.
- Dialogs and drawers use `role="dialog"` and `aria-modal="true"` when modal.
- Destructive or irreversible actions require clear copy and confirmation. Evidence deletion should stay non-destructive unless the backend exposes a controlled cleanup path.
- Preserve visible focus styles. Do not remove outlines without replacing them with an accessible focus ring.
- Support keyboard operation for navigation, menus, tables, drawers, and forms.
- Text must meet contrast requirements in light and dark mode.

### Clarity

- Use plain, direct language. Avoid internal phase names in customer-facing copy.
- Explain legal-evidence states in user terms first, technical terms second.
- Error copy should say what happened, what it affects, and what the user can do next.
- Support and operator diagnostics may include request fingerprints, correlation IDs, job IDs, and API states.

### User Control

- Give users safe escape paths: back to cases, dashboard, documents, support, or onboarding.
- Persist reasonable user preferences such as language, timezone, table filters, and selected conversations.
- Keep filters, sort state, and pagination visible enough that users understand why rows changed.
- Provide reset controls for complex table filters.

### Error Prevention And Recovery

- Validate required form fields before submit.
- Disable submit buttons during active requests.
- Prefer non-destructive review queues over immediate destructive actions.
- Distinguish:
  - authentication failures,
  - authorization or restricted-case failures,
  - local API unavailable states,
  - production API unavailable states,
  - validation errors,
  - long-running background processing.
- Recovery actions should be local to the failed surface whenever possible.

### Aesthetics And Trust

- The Evidence workbench should be restrained and professional.
- Use neutral surfaces with limited semantic color:
  - sky for primary action and information,
  - emerald for ready/success,
  - amber for warning/review,
  - red for failure or destructive risk,
  - gray for neutral/unknown.
- Avoid using color alone to communicate state. Pair color with text and icons when useful.
- Cards should stay practical: individual repeated items, contained tools, modals, and drawers. Do not nest cards inside cards.

### Scalability And Adaptability

- Design each route for desktop, tablet, and mobile.
- Tables must have usable mobile card views.
- Topbar controls must wrap without hiding account, support, language, or sign-out actions.
- Drawers should use `w-screen max-w-full` on mobile and a constrained max width on larger screens.
- Text must wrap or truncate intentionally. Long file IDs, hashes, emails, paths, and names cannot break the viewport.

## Component Baseline

### Page Header

Use `PageHeader` for all protected route pages.

Required:

- `title`
- short `description` for non-obvious pages
- `actions` for route-level commands

Rules:

- Titles and descriptions are translated by default.
- Use `translateTitle={false}` or `translateDescription={false}` only for dynamic data or user-provided values.
- Page actions must wrap and remain usable on mobile.

### Buttons

Use these button roles consistently:

- Primary: one main action on the surface, sky background.
- Secondary: normal navigation or neutral command, bordered white/dark surface.
- Destructive or cleanup review: amber or red only when risk is real.
- Icon-only: use lucide icons with accessible labels.

Rules:

- Buttons that start async work must show busy text such as `Saving`, `Uploading`, `Running`, or `Checking`.
- Do not use vague labels such as `Submit` when the action can be named.
- Button labels must pass through `t()`.

### Status Badges

Use `StatusBadge` for compact statuses.

Rules:

- Prefer backend status values when they already exist.
- Normalize unknown values through `humanizeKey`.
- Badge text must be meaningful without relying on color.
- Add translations for new customer-visible status labels.

### Statuses Need Solutions

No readiness tile, health check, warning banner, empty/error state, or badge-led status may end in a dead end.

Every issue state must answer:

- What is happening in plain language.
- What it affects in the app.
- What the user, admin, operator, or support team can do next.
- Where the action goes, and that destination must repeat the same issue and solution.

Rules:

- Prefer calm labels such as `Processing documents`, `Search still catching up`, `Connection needs attention`, or `Source check needs review`.
- Avoid issue labels that imply legal conclusions or panic, such as `evidence failed`, `not court-ready`, `disclosure incomplete`, or `legally insufficient`.
- A status action can be self-service, such as `Reconnect`, `Request processing`, `Review documents`, `Resend invite`, or `Refresh status`.
- A status action can be operator/support routed, such as `Queue alignment check`, `Open Jobs`, or `Help & Support`, but the destination must explain what the operator/support action resolves.
- If the user can safely continue elsewhere, say so.
- For operations-only details, translate raw infrastructure symptoms into workflow effects before showing them in normal workspace paths.

Examples:

- Pending copied documents: explain that files are saved but still need text extraction and search indexing; link to Documents or Health resolution with `Request processing`.
- Source alignment gaps: explain that connected files and processed records do not fully match yet; provide `Queue alignment check` and `Open Documents`.
- Connector offline: explain that new sync may pause while existing workspace documents remain available; provide `Reconnect` or `Try sync again`.
- Invite/email uncertainty: explain that the invite is still pending or delivery could not be confirmed; provide `Resend invite` and `Copy invite link`.

### Metrics

Use `MetricTile` for dashboard and health summary numbers.

Rules:

- Metrics need a short label, a value, and a plain-language detail.
- Use semantic tone only when it changes the user's interpretation.
- Large numbers should use locale-aware formatting.

### Tables

Use `DataTable` for evidence records, jobs, entities, source rows, and admin records.

Rules:

- Provide a stable `rowKey`.
- Provide mobile title, subtitle, metrics, or actions for important tables.
- Use header menus for table-specific filtering and sorting.
- Surface active filters and sort order.
- Provide reset when filters can combine.
- Empty states must distinguish no data from no matches.

### Forms

Rules:

- Every input has a visible label or screen-reader label.
- Required fields should be obvious before submit.
- Preserve entered data after recoverable errors.
- Translate labels, helper text, placeholders, validation errors, and button states.
- Use select controls for known option sets; use text inputs only when freeform input is needed.

### Drawers And Dialogs

Rules:

- Use drawers for focused details that support the current route.
- Use dialogs for confirmations or short task interruptions.
- Include an obvious close control and click-away close only when it will not lose unsaved work.
- Keep drawers scrollable and viewport-safe on mobile.
- Translate titles, body copy, controls, and error states.

### Empty And Error States

Use `EmptyState` and `ErrorPanel`.

Rules:

- Empty states should tell the user why there is no content and what to do next.
- Error panels should include retry when retry is useful.
- API/network errors should include a next step beyond the raw exception message.
- Support/operator views may expose fingerprints; customer views should explain them only when useful.

## Multilingual Standard

The Evidence UI currently supports English and Brazilian Portuguese through `LocaleContext` and `src/evidence/i18n/translations.js`.

### What Must Be Translated

Translate all customer-visible UI chrome:

- navigation labels,
- page titles and descriptions,
- button labels,
- form labels and helper text,
- validation and error messages,
- empty states,
- status labels,
- table headers and filter labels,
- drawer and dialog copy,
- help prompts,
- loading and saving states.

### What Must Not Be Automatically Translated

Do not translate or rewrite source evidence content in the UI layer:

- uploaded document text,
- document filenames and paths,
- chat/SMS/email evidence,
- legal citations from source material,
- names, case titles, phone numbers, addresses, IDs, hashes, and request fingerprints,
- backend-provided answer text unless the API has intentionally returned it in the selected answer language.

Source evidence should remain faithful to the record. UI language changes should affect controls and explanatory copy, not the underlying evidence.

### Translation Implementation Rules

- Use `const { t } = useLocaleSettings()` in Evidence components that render user-facing strings.
- Wrap static UI strings with `t('String')`.
- Use interpolation for dynamic values: `t('Showing {first}-{last} of {total}', { first, last, total })`.
- Do not build translated sentences by concatenating fragments.
- Do not translate user-provided values; interpolate them into translated templates.
- Add new static strings to `src/evidence/i18n/translations.js` when they are customer visible.
- Keep `document.documentElement.lang` aligned with the selected locale through `LocaleContext`.
- Use locale-aware formatters for dates, times, and counts.
- Pass `preferences.language` and `preferences.timeZone` to API calls that produce language-sensitive answers or help text.

### Language Switch UX

- The language selector must remain accessible from the topbar.
- Switching language should not reset route, case, filters, current conversation, or unsaved form state.
- If a translation is missing, English fallback is acceptable, but the missing key should be treated as polish debt before customer release.
- Copy should be written so labels can expand in Portuguese without breaking layouts.

## Route-Level Checklist

Every new or materially changed Evidence route must answer:

- Does the route use `PageHeader`?
- Is the primary user action obvious?
- Are loading, empty, success, and failure states covered?
- Does the route behave correctly for viewer, contributor, lawyer/operator, admin, and owner roles where relevant?
- Does it fit mobile, tablet, and desktop?
- Are all static UI strings translated?
- Are dates, times, and numbers locale-aware?
- Are source evidence values preserved in their original language?
- Are API failures recoverable?
- Are support diagnostics hidden unless the user role or mode should see them?

## Pull Request Checklist

Frontend Evidence PRs should include:

- `npm.cmd run lint`
- `npm.cmd run build`
- browser check for the changed route
- mobile-width check when layout changed
- dark-mode check when colors or surfaces changed
- language check for English and Portuguese when copy changed
- before/after screenshots for visible UX changes
- a note if any text is intentionally not translated because it is source evidence or dynamic user data

## Current Follow-Up Work

These standards connect to the Evidence System project todo items:

- `Frontend: Evidence branding and text artifact cleanup`
- `Frontend: API unavailable and local-dev fallback UX`
- `Frontend: Route-level code splitting for Evidence workbench`
- `Frontend: Evidence smoke tests for login, shell, and deep links`
- `Frontend: Responsive Evidence workbench polish pass`
- `Frontend: Split oversized Evidence page components`
- `Frontend: Evidence onboarding and no-case flow hardening`
- `Frontend: Evidence design system and accessibility audit`
