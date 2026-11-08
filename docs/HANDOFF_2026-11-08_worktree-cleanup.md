# Handoff: leftover agent worktrees (2026-11-08)

These are temporary git worktrees and a venv left behind by earlier Claude sessions. Every
committed change in them is already on `prototype` (and so on GitHub `main`). Deleting them loses
no work. It only frees disk space; the machine was full and commands were failing with ENOSPC.

`<tmp>` = `/private/tmp/claude-501/-Users-fi-it-Documents-projects-culturas-club-management-platform-`

## State per item (checked 2026-11-08)

| Worktree | Branch / head | Work it held | In `prototype` | Uncommitted | Now |
|---|---|---|---|---|---|
| `<tmp>/0ea16a87…/scratchpad/wt/features` | `wave3/features` `47519b6` | F-06 clubs cap and leave, F-07 feed, F-08 profile tabs | yes | none | **deleted** |
| `<tmp>/0ea16a87…/scratchpad/wt/motion` | `wave3/motion` `9ea3f2a` | M-01 motion system | yes | none | **deleted** |
| `<tmp>/0ea16a87…/scratchpad/wt/robot` | detached `b38931e` | T-01 Robot e2e (branch `wave3/robot` `a05d51c`) | yes | none | **deleted** |
| `<tmp>/c36ecf07…/scratchpad/wt/calendar` | `wave4/calendar` `2247d2d` | Five-club cap, whole-hour bookings, staff calendar | yes (merge `85a0b3a`) | none | **empty shell, 8 KB, no `.git`** |
| `<tmp>/c36ecf07…/scratchpad/wt/reporting` | `wave4/reporting` `5b944b8` | WIP post-event reporting (backend) | yes (merge `eac4158`) | none | **deleted** |
| `.claude/worktrees/agent-a26d31217f7fec2df` | `worktree-agent-a26d…` `a13236a` | F-05 staff screens | yes | 43 files, **all deletions** (a removal was interrupted part-way) | 263 MB, still registered |
| `.claude/worktrees/agent-a5c1e57a12a25810c` | `worktree-agent-a5c1…` `2058a80` | F-04 club screens | yes | none | 263 MB, still registered |
| `.claude/worktrees/agent-aefc1a0f88e47dc18` | `worktree-agent-aefc…` `82cddbd` | F-03 organiser scan station | yes | none | 263 MB, still registered |
| `<tmp>/cc5473df…/scratchpad/venv` | n/a | Spare Python venv | n/a | n/a | **broken** (no `pyvenv.cfg`), 30 MB |

The branches `wave3/*`, `wave4/*` and `worktree-agent-*` still exist locally, and `wave4/*` also
exists on GitHub. They are fully merged, so they are safe to delete with `git branch -d`.

## Keep

- `<tmp>/0ea16a87…/scratchpad/venv` (854 MB): the Python 3.12 venv with Celery, needed for backend
  tests and for migrating and seeding Neon. See `HANDOFF_2026-11-08_vercel-prototype.md`.
- `<tmp>/ecbf937a…/scratchpad/wt-guide` (detached `85a0b3a`): a worktree from another session
  (the user guide). It was not on this list, so leave it until that session is done.

## Finish the cleanup

Run from the repo root:

```sh
B=/private/tmp/claude-501/-Users-fi-it-Documents-projects-culturas-club-management-platform-
git worktree remove --force .claude/worktrees/agent-a26d31217f7fec2df
git worktree remove --force .claude/worktrees/agent-a5c1e57a12a25810c
git worktree remove --force .claude/worktrees/agent-aefc1a0f88e47dc18
rm -rf $B/c36ecf07-27a1-4814-9123-f648d1be2d99/scratchpad/wt/calendar \
       $B/cc5473df-d514-4ba3-9ff4-ebd2e9210837/scratchpad/venv
git worktree prune
# optional, once you no longer want the branch names:
git branch -d wave3/features wave3/motion wave3/robot wave4/calendar wave4/reporting \
  worktree-agent-a26d31217f7fec2df worktree-agent-a5c1e57a12a25810c worktree-agent-aefc1a0f88e47dc18
```

This frees about 820 MB more. The disk is about 432 of 466 GB used, so the large consumers are
elsewhere (Android emulator images, Docker).
