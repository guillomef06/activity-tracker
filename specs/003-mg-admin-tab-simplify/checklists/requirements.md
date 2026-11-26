# Specification Quality Checklist: Simplify the Admin "MG Event" Tab

**Created**: 2026-11-06
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details beyond what the request names (Material components, existing services)
- [x] Focused on user value (weekly flow first, fewer blocks, one Save)
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable (blocks, Save buttons, pixel offsets, clicks) with before values
- [x] Acceptance scenarios and edge cases defined (no event, no finished event, finished without selection, DKP off, capacity 50, long names, partial save failure)
- [x] Scope clearly bounded (no business logic, pricing, service, SQL or new feature)
- [x] Assumptions identified (draft statuses, eager content, wish/comment trade-off, translations)
- [x] Coexistence of the current event and the last finished event explicitly preserved
- [x] Risk and rollback documented

## Feature Readiness

- [x] Every functional requirement maps to an acceptance scenario
- [x] User scenarios cover the weekly flow, the duplicate data, the settings and the correction
- [x] Weekly-flow click count documented before and after (research.md D9)
- [x] Data-safety rules for e2e (ERA008-DEMO only, reserved dates, restore settings) recorded

## Notes

- The BEFORE screenshots and metrics were captured before any UI change (`screens/before/`).
- Open question for the user: show the desired position on placed rows in draft (panel change), see spec Assumptions.
