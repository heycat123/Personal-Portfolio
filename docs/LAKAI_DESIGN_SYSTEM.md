# Lak.ai Evidence Design System

## Status

This document is the implementation source of truth for the Lak.ai redesign of the `/evidence` app. It applies only to Evidence routes and must not change the public portfolio pages unless a separate portfolio request explicitly says so.

The visual reference is the Stitch project `Case Home - Evidence AI`, using the Aurelian Haven design system and the approved desktop concepts:

- `People & Contacts - Lak.ai Refined Branding`
- `Lak.ai Desktop Storyboard - Aurelian Haven`
- `Ask Documents - Example 1`
- `Ask Documents - Example 1B Settings Open`

## Standard Stack

Lak.ai design work should use this stack:

1. **Stitch visual screens**
   - Used for page concepts, storyboards, layout exploration, and approval.
   - Stitch output is not copied directly into production React.

2. **This design-system specification**
   - Defines the IA, components, color tokens, copy rules, accessibility, localization, and interaction standards.
   - Any new Evidence page should be checked against this document before implementation.

3. **Evidence React component library**
   - Shared components should encode the standard: shell, sidebar, page headers, cards, badges, drawers, dialogs, source strips, chat bubbles, and empty states.
   - Avoid one-off page markup when a reusable component pattern exists.

4. **Theme tokens**
   - Colors, spacing, radius, shadows, status tones, and typography should be centralized with CSS variables or a comparable token layer.
   - Changing the component colors should require token edits, not page-by-page hunting.

5. **Verification**
   - Lint and build are required before PR.
   - Visual smoke is required for changed pages.
   - Normal-user smoke must confirm operator/admin details remain hidden.

## Product North Star

Lak.ai is a family-law evidence workspace for people who need calm, organized help with stressful case materials. It should help users:

- Understand what they have.
- Review documents, people, contacts, source readiness, and sharing.
- Ask source-based questions with citations.
- Prepare materials for review or lawyer handoff.
- Avoid dead ends when something needs attention.

The product is evidence organization and retrieval. It is not legal advice, legal strategy, court readiness, filing readiness, admissibility review, or proof of a legal claim.

## Design Principles

### Calm Structure

- The UI should feel like a family-law sanctuary: quiet, organized, and steady.
- Use whitespace as structure.
- Avoid crowded tables and dense operational dashboards in normal-user paths.
- Use cards and drawers for focused review, but do not nest cards inside cards.

### Clear Affordance

- Buttons look clickable.
- Inputs look editable.
- Icon-only actions need clear accessible labels and tooltips.
- Sliders icon means section-level options for the current page or panel.
- Gear icon means broader case, account, or system settings.

### Feedback For Every Action

Every user action must visibly answer:

- What happened.
- Whether it is still happening.
- What it affects.
- What the user can do next.

Idempotent actions must still provide feedback. If work already started, say it already started and point to the current status. Do not create duplicate-looking work or silently no-op.

### No Dead Ends

Every warning, status card, empty state, failed state, and action button must lead to a meaningful next step. A user should never click a button and land on a page that only restates the problem without a solution or matching status.

### Consumer First, Lawyer Ready

- Primary language must work for a normal person.
- Professional/lawyer usefulness comes from clarity, source citations, review status, and organized handoff.
- Do not turn normal screens into operator dashboards or legal-theory cockpits.

### Privacy By Default

Family-law chats and records may include sensitive information about children, finances, medical care, school, safety, private communications, and legal strategy. Default sharing behavior should be conservative.

## Brand

- Product name: `Lak.ai`
- Subtitle: `Family law sanctuary`
- Brand display should be compact in the sidebar and should not take large vertical space.
- The app should not show raw runtime labels, API paths, local tunnel names, deploy metadata, or backend terms in normal-user chrome.

## Information Architecture

### Evidence App Shell

The `/evidence` shell uses one shared sidebar and topbar. The sidebar is the user's map of the case, not a list of system tools.

Primary sidebar:

- My Cases
- Case Home
- Documents
- Ask Documents
- People & Contacts
- Packets
- Sharing & Lawyer Access
- Help & Support

Bottom controls:

- Case Settings
- Account
- Sign out

Role-gated operations:

- Jobs
- Health
- System Query
- Tests
- Admin
- Diagnostics

Role-gated operations must not appear for normal viewers, contributors, or case users unless their role explicitly allows it.

### New Case

Do not show a large `New Case` button in the sidebar. Creating a case is rare and belongs inside `My Cases` as `Create personal case workspace`.

### Connected Sources

Full connector management belongs in:

- `Case Settings` > `Connected sources`

Work pages may show contextual source strips:

- Documents: document sources only, such as Google Drive connected, upload files available, more sources available.
- People & Contacts: contact sources only, such as Google Contacts connected or contacts found in messages.

Do not list every unavailable connector on work pages. It is acceptable to say `More sources available` with a manage icon.

## Theme Tokens

The production implementation should centralize these token roles. Exact values may be tuned during implementation, but pages should consume roles, not hardcoded colors.

### Core Color Roles

- `--lakai-bg`: app background, warm bone/parchment.
- `--lakai-surface`: default card and panel surface.
- `--lakai-surface-muted`: subtle grouped surface.
- `--lakai-border`: warm low-contrast border.
- `--lakai-text`: primary text.
- `--lakai-text-muted`: secondary text.
- `--lakai-primary`: heritage blue for primary actions and active nav.
- `--lakai-primary-text`: text on primary.
- `--lakai-accent`: gold-beige accent.
- `--lakai-accent-soft`: soft accent surface.

### Status Color Roles

- `--lakai-ready`: available for the stated app purpose.
- `--lakai-review`: needs review, suggested, processing, partial, or waiting.
- `--lakai-blocked`: blocked action, destructive risk, security/access loss, or true failure.
- `--lakai-neutral`: unknown, archived, hidden, or informational.

Green is allowed for clear connection/status confirmation such as `Google Contacts connected`, but it should not imply legal completeness.

### Typography

- Headings: Literata-style serif from Aurelian Haven.
- UI and body: Manrope-style sans-serif from Aurelian Haven.
- Body text minimum: 16px.
- Do not scale font size directly with viewport width.
- Letter spacing must remain readable and must not be negative in compact UI controls.

### Shape And Elevation

- Default radius: 8px.
- Large panels and cards: 12px to 16px.
- Status chips may use pill shapes.
- Use tonal layers and subtle borders more than heavy shadows.

## Component Standards

### App Shell

The shell must provide:

- Fixed or stable sidebar on desktop.
- Stable topbar/header.
- Main content scrolls inside the content area.
- Mobile navigation must preserve access to primary routes without crowding.

### Page Header

Every protected route needs a clear page header:

- Page title.
- One-line purpose.
- Primary page action when applicable.
- Section-level sliders icon when the page has page-specific options.

### Buttons

- One primary action per surface when possible.
- Name the action directly: `New chat`, `Add contact`, `Show matching documents`, `Save settings`.
- Avoid vague `Submit`, `Run`, or `Proceed` when the action can be named.
- Buttons starting async work must show loading and completion feedback.

### Status Badges

Badge text must be meaningful without color:

- Connected
- Needs review
- Source citations available
- Search still catching up
- Processing documents
- Hidden from review
- Confirmed by you

Avoid:

- Verified identity
- Evidence failed
- Court-ready
- Filing-ready
- Legally sufficient
- Proof

### Source Strips

Source strips summarize relevant sources for the current page.

Documents strip examples:

- Google Drive connected
- Upload files available
- More sources available
- Manage document sources

People & Contacts strip examples:

- Google Contacts connected
- Contacts found in messages
- Manage contact sources

### Drawers

Use drawers for focused detail without losing page context:

- Contact details.
- Add contact.
- Ask settings.
- Citation detail.
- Document preview.
- Case detail edit.

Drawer actions must be explicit. Destructive or hiding actions need clear copy and confirmation.

### Dialogs

Use React dialogs, not browser-native `alert`, `prompt`, or `confirm`.

Dialog buttons must say exactly what happens:

- Keep file
- Hide from review
- Soft remove from workspace
- Delete secure workspace copy

### Empty States

Empty states should say:

- What is missing.
- Why it matters.
- What to do next.

## Ask Documents Standard

Ask Documents is a core Lak.ai experience and must be especially clean.

### Labels

- Page: `Ask Documents`
- Primary action: `New chat`
- Search: `Search chat history`
- Search helper: `Search previous chats and answers`
- Filters: `Mine`, `Shared with me`, `All case chats` when authorized, `Needs source review` when supported.

Avoid default `Lawyer` filters because a lawyer may not be connected to the case.

### Conversation History

Conversation rows should show:

- Title.
- Last message snippet.
- Updated time.
- Status.
- Starter metadata: `Started by [display name]`.
- Participant initials where useful.

Starter and participant role labels must come from explicit account/role metadata. Do not infer attorney status from a name, email domain, or invitation.

### Privacy Default

New chats should default to `Only me` for consumer-first MVP unless backend/product policy explicitly changes. Family-law chats may contain sensitive case information.

Visibility options:

- Only me
- People with case access
- Specific people, later

When changing to case access, show:

`People with access to this case will be able to see this chat and its sources.`

### Ask Settings

The sliders icon opens `Ask settings`, a section-level drawer.

Recommended settings:

- Enhanced chat, only if available on this account.
- Show follow-up suggestions.
- Show document readiness before asking.
- Default visibility.
- Show who started each chat.
- Show source citations when available.
- Warn when documents are still processing.

If enhanced chat is unavailable, hide it unless there is a product reason to explain the unavailable state. Do not imply enhanced chat is legally better.

### Answer Design

Answers should include:

- Answer.
- Source citations.
- What to review next.
- Helpful / Needs review feedback.

Citation labels should use recognizable source names:

- Document title and page.
- Message thread and date.
- Transcript timestamp.

Do not use raw ledger IDs, vector IDs, job IDs, prompt versions, trace data, or model names in normal-user answers.

### Guardrail Copy

Ask Documents should show this or an approved equivalent:

`Answers are based on your available sources and may need review. Lak.ai does not provide legal advice or decide whether materials are admissible or ready for court use.`

## People & Contacts Standard

Use `People & Contacts`, not `Entities`.

Recommended subsections:

- People
- Contact details
- Needs review
- Relationships
- Sources

Safe labels:

- Person/contact record
- Names used in documents
- Contact details
- Relationship labels
- Possible matches
- Documents mentioning this person
- Confirm contact link
- Suggested match
- Confirmed by you
- Confirmed by lawyer
- Imported from contacts
- Seen in messages
- Found in documents
- Hidden from review

Hide dialog:

- Title: `Hide from review?`
- Body: `This removes the contact from your People & Contacts review list. It does not delete original messages, documents, or source contact records.`
- Reason label: `Reason, optional`
- Primary: `Hide from review`
- Secondary: `Keep in review`

Manual contact helper:

`Manual contacts help organize this workspace. They do not verify legal identity or change the original source records.`

Relationship labels help organize the workspace and do not decide legal roles.

## Documents Standard

Documents should focus on organization and readiness, not backend storage mechanics.

Use:

- Documents
- Category review
- Category
- Issue tags
- Pages / extracted text
- Transcript for audio/video transcript records
- Secure workspace copy
- Source file
- Processing status
- Not processed yet
- Needs review

Avoid normal-user labels:

- S3
- Postgres
- Vector
- Graph
- Cloud only
- Sub-documents
- Source proof
- Pipeline

## Case Home Standard

Case Home should summarize readiness and review work:

- Documents needing review.
- Search & Q&A readiness.
- People & contacts needing review.
- Source readiness.
- Access & sharing.

Every card must include:

- What is happening.
- What it affects.
- One clear next action.

## Sharing & Lawyer Access Standard

Use workspace access language:

- Invite people.
- Workspace access.
- Pending invitations.
- Active access.
- Copy invite link.
- Revoke access.

Guardrail:

`Inviting a lawyer gives account access to this workspace. It does not by itself create an attorney-client relationship unless you and the lawyer separately agree.`

## Case Settings Standard

Settings is secondary. It belongs in the bottom sidebar area.

Recommended sections:

- Case details
- Connected sources
- Privacy & data
- Notifications, later

Case display name edit copy:

`This changes the workspace name only. It does not change any court filing, court case number, or legal record.`

## Legal And Product Copy Guardrails

Avoid in normal UX:

- Court-ready
- Filing-ready
- Safe to file
- Legally compliant redaction
- Admissible
- Legally sufficient
- This proves
- Best evidence
- Judge will care
- Recommended strategy
- Verified identity

Use:

- Source-based answer
- Source citations
- Needs review
- Suggested match
- Confirmed by you
- Attorney review
- Organizational review aid
- Review before sharing

## Accessibility

- Every interactive control must have a 44px minimum touch target where practical.
- Icon-only controls need `aria-label`.
- Drawers and dialogs need proper dialog semantics and keyboard escape.
- Color cannot be the only status signal.
- Text must meet contrast requirements.
- Focus states must be visible.

## Localization

Layouts must support Portuguese and Spanish expansion.

- Avoid fixed-width buttons that clip text.
- Use flex/grid with wrapping.
- Prefer concise labels but allow 20% to 30% longer strings.
- Language selector must use native language names, not flags.

## Implementation Rollout

Use focused PRs, but keep one shared standard:

1. Design-system documentation and token layer.
2. Shell/sidebar/topbar.
3. Shared components.
4. My Cases and Case Home.
5. Ask Documents.
6. Documents and Category Review.
7. People & Contacts.
8. Sharing & Lawyer Access.
9. Case Settings and Help.
10. Mobile adaptation after desktop is approved.

Each PR must run:

- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check`

Visual smoke should include the changed routes and at least one normal-user role path when possible.
