# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Students** find campus events, register, get a QR pass, and join up to five clubs. Mostly on phones.
- **Club officers** (President, Vice-President, Secretary, Treasurer) propose events with budgets, follow them through approval, run the door, and settle spend afterwards.
- **Approvers**: the **Cultural Society** (cultural and literary clubs only), the **Dean of Student Affairs** (every event; can lower budget lines, never raise them; manages venues and clashes) and **Management / the Vice-Chancellor** (events over ₹50,000 or part of a fest). They review on a computer and sign in with a 6-digit authenticator code.

## Product Purpose

Culturals is the college's single place for clubs and events: proposal → approval → publication → registration → door check-in → post-event report → budget settlement. Everything a club does leaves a record, so the semester report is built from the app instead of collected by hand.

## Operating Context

- Pilot/demo at https://culturals-clubs-events.vercel.app with seeded fictional data and one pilot account per role (password `culturals-demo`; staff accept any 6-digit code on the demo).
- The guide audience being shown the pilot (Nov 2026): Management/VC, the Dean and Cultural Society members, who are asked to suggest improvements.
- Docs live in `docs/user-guide/` (Markdown → GitHub Pages) with screenshots in `docs/user-guide/img/`.

## Capabilities and Constraints

- Approval chain: Club → Cultural Society (cultural/literary only) → Dean (always) → Vice-Chancellor (over ₹50,000 or fest) → Published. Each gate: Approve, Return for changes (comment required), Reject (comment required, final).
- Approver pages: approvals queue, proposal review, Venues (Dean), Calendar, This semester, Semester report.
- 48-hour SLA per gate ("Past SLA").

## Brand Commitments

- Name: **Culturals**. The app's design system (`clubs-and-culturals-platform/app/frontend/src/shared/ds/tokens.css`) is the visual authority: Plus Jakarta Sans, navy wordmark, Culturals blue as the action colour, light and dark themes.

## Evidence on Hand

- Real screenshots of every role's pages in `docs/user-guide/img/` (seeded demo data, fictional names).
- No testimonials, usage numbers or college logo are on hand; don't invent them.

## Product Principles

1. Every decision leaves a record: who, when, and why.
2. Approvers are accountable for money, so their sign-in is stronger and their comments are required when they say no.
3. Plain language over jargon; the app tells people what to do next.
