# Handoff: quick guide for club officers and approvers (2026-11-09)

Goal: a short guide with screenshots for the people the pilot is being shown to: club officers,
the Cultural Society, the Dean and management. The existing user guide stays as the full reference
for officers, staff and developers. The quick guide also shows the student side, so these readers
can suggest improvements to it.

## Where things stand

| Item | State |
|---|---|
| Quick guide | **Live** at https://chargingtrex.github.io/culturals-clubs-events/user-guide/quick-guide.html (HTTP 200 after the deploy). |
| Source | `docs/user-guide/quick-guide.md`, about 110 lines. |
| Build | `docs/user-guide/build.py` renders it with its own simple layout (one column, larger text, no chapter sidebar). It also adds **Quick guide** to the top of the full guide's sidebar. |
| Full guide | Unchanged, apart from a "New to Culturals? Read the quick guide" note at the top of `README.md`. |
| Commits | `6aee1d5` on `prototype` (pushed). Merged to `main` as `ff26705` (pushed). The `user-guide` workflow ran and succeeded. |
| Screenshots | All reused from `docs/user-guide/img/`. No new images. |

## What the quick guide covers

1. **Sign in**, including the authenticator code that approvers need.
2. **How an event gets approved**: Club → Cultural Society → Dean → Vice-Chancellor → Published, with
   who sees what and the three decisions.
3. **For club officers**: propose an event, track it on the approval trail, what to do if it is
   returned, and settling after the event.
4. **For the Cultural Society, the Dean and the Vice-Chancellor**: the approvals page, Review,
   Approve / Return / Reject, Calendar, This semester, Semester report.
5. **What students see**: four phone screenshots in a row (Feed, event page, My passes, Clubs), and
   a prompt to send ideas.
6. **Quick answers**, plus a link to the full guide.

## Remaining steps

1. **Add a feedback contact.** The guide ends with "send it to the Culturals team", but no email
   address or form link is given. Add one in the "What students see" section of `quick-guide.md`.
2. **Decide on the VC overview.** `docs/user-guide/overview-for-vc.md` is still uncommitted, and the
   local `README.md` links to it. `build.py` does not render it (it is not in `CHAPTERS`), so the
   link would 404 if pushed as it is. Either add it to the build (as a chapter, or as a second simple
   page like the quick guide) or remove the link.
3. **Check the member screenshot.** `img/club-03-nav-member.png` shows a **Send for approval** button
   to Sneha, a plain member, on a draft card. The club officers guide says members see only **Open**.
   Either the frontend shows the button to the wrong roles or the screenshot is stale. The quick
   guide does not use this image.

## How to update and publish

```sh
cd docs/user-guide
uv run --no-project --with markdown==3.7 python build.py . /tmp/site/user-guide   # preview
python3 -m http.server -d /tmp/site                                             # open /user-guide/quick-guide.html
```

The site only rebuilds from `main` (`.github/workflows/user-guide.yml`, on changes under
`docs/user-guide/**`). The workflow here: commit on `prototype`, push it, then merge into `main`
with a `Merge prototype: …` commit and push. The working tree has a lot of unrelated uncommitted
work, so this session did the merge in a temporary `git worktree` on `origin/main`.

## Decisions made this session

- **A separate page, not a new chapter.** The quick guide has its own layout, so it doesn't look
  like the long reference chapters. It is named `quick-guide` rather than `members`, because the
  audience changed from students to officers and approvers partway through.
- **`md_in_html` was added** to the Markdown extensions so the four student screenshots can sit in a
  `<div class="phones">` grid. Other chapters render the same as before.
- **Committed only the quick guide.** The README was staged with only the quick-guide note. The VC
  overview link and every other uncommitted change were left out.

## Not this session's work

The working tree has about 90 other uncommitted or untracked changes from other sessions: backend
`open_block` work, new e2e suites and `.github/workflows/e2e.yml`, frontend `JoinRequestsPage`,
`PostEventReport` and `EventGallery`, QA findings, and `EMAIL_TO_ANIL_SIR.md`. None of it was
touched or pushed.
