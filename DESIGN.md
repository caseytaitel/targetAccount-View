# Design

The goal is the CRO dash's look: clean and simple, so the eye knows exactly where to go.
Tokens, tab bar, `.fb` filter pills, `.pill` / `.pill-tag`, the sticky-header table pane and
dark mode are ported from `cro_kpi/render/assets.py` into `app/globals.css`.

## Decisions

1. **Hierarchy:** territory tabs (top), then tier sections (inside the table, as collapsible group rows), then accounts.
   Out of Territory sits on the right of the tab strip, set apart like the CRO dash's quiet tab.
2. **Section order:** Tier A, B, C, Untiered, Revisit later. Untiered is open by default because
   tiering is new and every account starts there. Revisit later is collapsed by default.
3. **Sort and filter:** a pill bar above the table.
   - Sort: Name / Company Owner / Company Tags (tag count, most first).
   - Tag filter: OR across the selected tags; nothing selected means all.
   - Company Owner and Outreach Owner filters.
   - Sort applies within each section.
4. **Tag tooltips:** a custom fixed-position popover replaces the CRO dash's native `title`. It supports
   multi-line drill-downs and can't be clipped by table cells. Values only, with no property-name
   prefix (Casey, 2026-10-01). Pills are keyboard-focusable and show the same popover.
5. **Inline editors:** Tier, Outreach Owner and Outreach Status are pill-shaped selects that are
   tinted by value. An unset select is dashed, matching the CRO "not set" idiom. They save immediately,
   because they are app state, not HubSpot.
6. **The HubSpot write is gated twice:**
   - The drawer's "Save to HubSpot…" only opens a modal.
   - The modal names the company and the property, shows the full new value with the added entry
     highlighted, and starts with focus on **Cancel**, so a stray Enter never writes.
7. **Concurrent notes:** if `notes` changed in HubSpot after the drawer loaded, the write is refused (409).
   The drawer shows the latest text with an amber notice and nothing is lost.
8. **Quiet flags, no loud banners (CRO rule):**
   - Data gaps show as ⚑ with the reason on hover: blank territory status, unmapped accounts, and the
     in-memory dev store.
9. **Per-viewer conveniences:** the selected tab, the sort and collapsed sections are kept in `localStorage`.
   Everything shared (tier, outreach, revisit) is in Redis.
