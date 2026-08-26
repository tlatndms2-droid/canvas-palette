# Project decisions

## Decision 001 — Card synchronization

- Current implementation: import-time snapshot plus origin metadata.
- Unresolved: whether future live or manual synchronization is desirable.
- Status: defer until real-use feedback.

## Decision 002 — File display title

- Current implementation: display title is palette metadata only.
- Constraint: never rename MD/image source files implicitly.

## Decision 003 — Pending import

- Current implementation: imported items leave pending and enter the selected workspace as loose items.
- Unresolved: retain a history or allow multi-workspace membership.

## Decision 004 — Canvas API boundary

- Current implementation: `CanvasAdapter` uses Canvas document JSON for durable mutations and guarded runtime selection access.
- Reason: isolate unstable Canvas runtime details and keep storage stable.

## Decision 005 — Underspecified controls

- More menu, Copy, original-open action, filter composition, final pane limits, and detailed multi-select behavior remain intentionally undefined.
