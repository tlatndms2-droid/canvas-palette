# Canvas Palette Responsive UI Design Specification

Status: **approved and implemented**. Feature 2 is released as `0.3.42`, Feature 6 as `0.3.43`, and Feature 8 as `0.3.44`.

## Reference findings

- Obsidian core: use pane headers, compact `clickable-icon` actions, native menus, theme variables, visible focus, and content-owned scrolling.
- Notebook Navigator: when a navigation split becomes too narrow, keep one pane usable and switch context rather than squeezing both panes to zero width.
- Quiet Outline: preserve hierarchy depth, expansion, and keyboard navigation when changing representation.
- Canvas Palette 0.3.41: Mini has a fixed three-pane shell and only one `900px` CSS fallback; Side always renders Viewport/Outliner and Tag/Label as split panes. Responsive work must reuse the existing search, selection, density, relay, Workspace, and Collection state.

## Verified Sandbox baseline

- Verified in the existing `Obsidian Mini Palette Sandbox` with Obsidian `1.13.7` and Canvas Palette `0.3.41` loaded through the isolated profile and CDP port `9237`.
- At the current Side host width of `543.5px`, Viewport and Outliner render at `266px` and `245.5px`; the `519.5px` content surface has `scrollWidth = clientWidth = 520px`.
- The restored Mini baseline measured `977×650px` at `x=344` inside a `960×1032px` viewport, leaving its right edge outside the viewport. Responsive restoration therefore must clamp both position and size without discarding saved Wide pane widths.
- Baseline inspection used the exact Sandbox page title and did not interact with the user's `secondbrain` Vault.

## Shared layout rules

| Token | Value |
|---|---:|
| Header height | 46px Mini / 48px Side |
| Compact action target | 30×30px minimum |
| Pane padding | 10–12px |
| Control gap | 6–8px |
| Divider hit target | 8px |
| Drawer edge gap | 8px |
| Drawer maximum width | 420px or host width minus 16px |
| Minimum readable asset width | 160px; Minimum state uses one column |

- Layout mode is derived from the host's measured content width with `ResizeObserver`.
- Breakpoint changes never modify Items, Workspace/Collection membership, Mini Storage membership, selection, query, density, or Canvas links.
- Only Side's last `Viewport | Outliner` tab is persisted per Workspace. Open drawers are session-only and start closed after reload.
- At most one drawer is open per palette. `Escape` and outside click close it; focus returns to its trigger. Search, filters, and selection do not auto-close it.
- Drawers are non-modal overlays and must not resize the Assets surface.

## Mini Palette

| State | Width | Persistent surface | Drawer / overflow |
|---|---:|---|---|
| Wide | `≥900px` | Control + Assets + Preview | None; panes remain resizable |
| Medium | `680–899px` | Quick Controls + Assets + Preview | Control drawer |
| Narrow | `480–679px` | Quick Controls + Assets | Control and Preview drawers |
| Minimum | `360–479px` | Two-row Quick Controls + one-column Assets | Control/Preview attached flyouts outside Mini; secondary bottom actions in overflow |

- Minimum window size remains `360×300px`.
- Collect/Storage, Search, Type, density, selection count, and the primary action remain reachable in every state.
- Pane widths saved in Wide/Medium are retained while narrow and restored when space returns.
- Preview reflects the canonical current selection and never owns or resets it.
- Preview opens to the right of Mini over the Canvas; when right-side space is insufficient it opens to the left. The Mini Assets surface remains visible and interactive.

## Side Palette

| State | Width | Persistent surface | Drawer / overflow |
|---|---:|---|---|
| Wide | `≥520px` | Viewport + Outliner split; Tag + Label split | Existing pane settings |
| Medium | `360–519px` | Viewport/Outliner tab | Indexes drawer; secondary header actions in native overflow |
| Very Narrow | `300–359px` | Single active tab, compact Workspace/Search | Indexes attached flyout outside Side; icon-only secondary actions and native overflow |

- Medium and Very Narrow use a `tablist` with Viewport, Outliner, and an Indexes trigger. In Very Narrow, Indexes opens to the left of Side over the Canvas so the active Viewport or Outliner remains visible; its internal tabs are Tags and Labels.
- The Viewport/Outliner tab persists per Workspace; Indexes is not a persistent content tab.
- At `300px`, `scrollWidth` must not exceed `clientWidth`; titles, Search, active Workspace, and primary navigation remain reachable.

## Keyboard and accessibility

- Tabs expose `role=tablist`, `role=tab`, `aria-selected`, and keyboard handling for Left/Right, Home/End, Enter, and Space.
- Drawer triggers expose `aria-expanded` and `aria-controls`; drawers have an accessible name and close control.
- Every icon-only action has an `aria-label` and Obsidian tooltip.
- Main actions are operable without a pointer. Focus never disappears during responsive rerender.
- Default Obsidian Light/Dark themes must meet WCAG AA contrast for text, selected state, and focus indicators.
- `prefers-reduced-motion: reduce` disables non-essential drawer and layout transitions.

## Approval mockups

- `mini-wide.png`
- `mini-medium.png`
- `mini-narrow.png`
- `mini-minimum.png`
- `side-wide.png`
- `side-medium.png`
- `side-very-narrow.png`

The mockups define information priority and component placement. Final pixel values may change only when Sandbox measurement proves a collision; any change must be recorded in this specification before implementation continues.
