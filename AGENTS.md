# AGENTS.md — Swell Parts

## Active application

- This directory is the active application for work in the `the_swell` workspace.
- Unless the user explicitly names another project, all implementation, searches, commands, local servers, and verification belong in this directory.
- Do not modify the sibling `../swell-frontend` application or any project under `../../old sites/` unless the user explicitly asks for that exact project.

## Source of truth

- `PRD.md` is the source of truth for this application's scope, routes, and Firebase data model.
- `PRODUCT.md` describes the product context and interaction principles.
- The active stack is Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, Firestore, and Firebase Storage.
- If a task changes the data model, update `PRD.md` in the same change.

## Verification

- Run `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build` before declaring implementation work complete.
- Local development runs at `http://localhost:3000` with `pnpm dev`.
