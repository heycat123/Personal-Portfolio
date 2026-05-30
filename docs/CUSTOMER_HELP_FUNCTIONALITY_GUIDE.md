# Evidence App Customer Help Guide

This guide is written for customer-facing help content. It avoids implementation details unless the user needs them to understand a status or limitation.

## Getting Started

The Evidence app helps you organize case documents, connect evidence sources, ask questions about the record, and review information the system finds in your files.

Most work happens inside a case workspace. If you have access to more than one workspace, make sure the correct case is selected before adding documents or asking questions.

## Sign In And Access

You must sign in before viewing case information. Your access is tied to each case, so a user may be able to open one case but not another.

If you were invited to a case, open the invitation, sign in or create your account, then accept the invitation. After acceptance, the app should take you to the correct case.

## Dashboard

The Dashboard is the best starting point after opening a case. Use it to jump to documents, ask a question, add documents, or check recent processing activity.

If something looks incomplete, check whether documents are still processing or ask support for help.

## Documents

The Documents page shows the files available in the selected case.

Use Documents to:

- Search for a file.
- Open a quick preview.
- Open the full document detail page.
- Check where a file came from.
- Download or export files when export is available.

Some documents may still be processing. If a file is present but does not appear in answers yet, check processing jobs or source sync status.

## Document Detail

The Document Detail page shows information about one file. It can include the source, preview, extracted content, processing status, and related case information.

Use this page when you want to inspect a specific file more carefully.

## Add Documents

Use Add Documents to bring evidence into the case.

Depending on your access, you may be able to:

- Upload files from your computer.
- Connect Google Drive.
- Browse and select Google Drive files or folders.
- Sync selected files.
- Import supported Google Drive files.
- Sync Google Contacts to help match phone numbers and email addresses to people.

Connecting a source does not mean every file in that source is automatically used. Select only the files or folders that belong in the case.

## Query

Use Query to ask questions about the evidence in the selected case.

Good examples:

- "Which documents mention the parenting schedule?"
- "What messages discuss school pickup?"
- "Which evidence supports this legal factor?"

Answers should include citations when evidence is available. If the system cannot find enough support, it should say so instead of guessing.

## Axiom Help

Axiom Help answers questions about how to use the product.

Good examples:

- "How do I use this page?"
- "How do I add Google Drive files?"
- "What does this job status mean?"
- "How do I review an alias?"

Use Query for questions about the case evidence. Use Axiom Help for questions about the app.

## Entities

Entities are people, organizations, places, contact points, and relationships the system finds in the case record.

Review tools can help confirm aliases, reject incorrect matches, move aliases to the right person, add contact points, and review possible duplicate people.

Entity review is usually an operator or lawyer workflow. Ordinary contributors may not see this page.

## Jobs

Jobs show background processing work. A job may be queued, running, finished, failed, cancelled, or retried.

Use Jobs to see whether a file sync, upload registration, source check, or test is still running. If a job fails, support may ask for its job ID or request fingerprint.

## Health

Health pages help operators check whether storage, graph/search, queue, and source sync are working.

Most users do not need this page. If support mode is enabled, health and request fingerprints can help diagnose a problem.

## Tests

Tests compare expected answers with system answers. This helps the team verify that retrieval and citations are improving.

This is usually an operator workflow, not a normal customer workflow.

## Settings

Settings contains workspace-level preferences and configuration. Depending on your role, you may only be able to view settings.

## Support

Use Support to report a problem, ask for help, or capture an idea. A useful report includes what you were trying to do, what happened, and which page you were on.

When support mode is enabled, the app may show request fingerprints or correlation IDs. These help support connect your report to backend logs.

## Admin

Admin tools manage users, case access, and invitations.

Admins can:

- Create or update users.
- Grant case access.
- Revoke case access.
- Create invitations.
- Cancel pending invitations.

Use the least access needed for each person.

## Privacy And Source Ownership

Only connect sources that belong in the case. A connected source is tied to the user who authorized it, and other users should not be able to browse or sync that private source unless an explicit admin/support rule allows it.

Disconnecting a source should stop future source access or sync. Deleting or removing stored evidence should follow a separate, clearly confirmed process.

## Current Readiness Notes

The product is actively being completed. Some workflows may still show operator language or partial processing status while the system is being hardened for live non-technical users.

Before inviting a real customer, verify:

- Sign-up/sign-in works.
- Invitation acceptance lands in the correct case.
- The user sees only allowed case data.
- Documents are visible and understandable.
- Query answers include useful citations or clear insufficient-coverage messages.
- Source sync status is clear.
- Support can diagnose problems without exposing unnecessary technical details.
