# Contributing to ALDO Toolkit

## Ground Rules
- Follow `docs/architecture.md` non-negotiable constraints.
- Keep this project an assistant/wrapper around documented Microsoft flows.
- Do not add claims that bypass Azure subscription, approval, or RBAC requirements.
- Keep server-side RBAC enforcement intact.

## Development Flow
1. Create a branch from `main`.
2. Keep changes small and reviewable.
3. Add/adjust tests for changed validation logic.
4. Update docs for behavior changes.
5. Open a pull request with:
   - summary
   - rationale
   - test evidence

## Coding Standards
- TypeScript strict mode is required.
- Validate API boundaries with zod.
- Avoid storing secrets in repository.
- Use structured logging and preserve audit evidence.

## Commit Guidance
- `feat:` new functionality
- `fix:` bug fix
- `docs:` documentation
- `refactor:` non-functional structural changes
- `test:` tests
- `chore:` tooling/maintenance

## Security
If you discover a security issue, do not disclose publicly in issues. Coordinate privately with maintainers first.
