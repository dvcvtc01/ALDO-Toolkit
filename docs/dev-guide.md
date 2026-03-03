# ALDO Toolkit Developer Guide

## Stack
- Monorepo: npm workspaces
- Web: Next.js + Fluent UI
- API: Fastify + OpenAPI + zod
- Worker: BullMQ
- Data: Postgres + Redis

## Local Development
1. Copy environment template:
   - `cp docker/env.example .env` (PowerShell: `Copy-Item docker/env.example .env`)
2. Start services:
   - `docker compose -f docker/docker-compose.dev.yml up --build`
3. Access:
   - Web: `http://localhost:3000`
   - API: `http://localhost:4000`
   - API docs: `http://localhost:4000/docs`

## OpenAPI Flow
- API emits OpenAPI JSON at `/openapi.json`.
- Generate and sync client types:
  - `npm run generate:openapi`
- Web client uses generated types in `apps/web/src/lib/api-types.ts`.

## Validation Logic
- Shared schemas and validators live in `packages/shared`.
- API enforces zod validation at request boundaries.
- Unit tests for validators are in `packages/shared/test`.

## Runner
- PowerShell runner module is in `runner/powershell/aldo-runner`.
- Current MVP capability:
  - DNS checks
  - TCP 443 reachability check
  - environment checker placeholder status
  - transcript + evidence post to API

## CI
- GitHub Actions workflow runs:
  - lint
  - tests
  - builds

## Contribution Rules
- Keep TypeScript strict.
- Keep server-side RBAC checks mandatory.
- Document assumptions in `docs/architecture.md`.
- Do not add secrets to repository files.
