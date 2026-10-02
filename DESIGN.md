# Design

The goal is the CRO dash's look: clean and simple, so the eye knows exactly where to go.
Tokens, tab bar, `.fb` filter pills, `.pill` / `.pill-tag`, the sticky-header table pane and
dark mode are ported from `cro_kpi/render/assets.py` into `app/globals.css`.

## Decisions

1. **Hierarchy:** territory tabs (top), then tier sections (inside the table, as collapsible group rows), then accounts.
   Out of Territory sits on the right of the tab strip, set apart like the CRO dash's quiet tab.
2. **Section order:** Tier A, B, C, Untiered, Revisit later. Untiered is open by default because
   tiering is new and every account starts there. Revisit later is collapsed by default.
3. **Sort and filter** (revised by Casey, 2026-10-01):
   - Sort lives in the column headers. Each sortable header has black carets: both stacked when
     idle, one pointing the active direction. Click to sort, click again to flip. Tier has no
     caret because rows are already grouped by tier. Sort applies within each section.
   - The pill bar above the table holds only two filters: Owner (All / Jeff / John) and
     Outreach (All / Casey / Jeff / John / Unassigned). The Sort pills and the Tags filter were removed.
4. **Tag tooltips:** a custom fixed-position popover replaces the CRO dash's native `title`. It supports
   multi-line drill-downs and can't be clipped by table cells. Values only, with no property-name
   prefix (Casey, 2026-10-01). Pills are keyboard-focusable and show the same popover.
5. **Inline editors:** Tier, Outreach Owner and Outreach Status are pill-shaped selects that are
   tinted by value. An unset select is dashed, matching the CRO "not set" idiom. They save immediately,
   because they are app state, not HubSpot.
6. **Every HubSpot write is gated twice:**
   - The drawer's "Save to HubSpot…" (notes) and the Data Hygiene row's "Save…" (territory) only open a modal.
   - The modal names the company and the properties, states the change, shows the new value(s)
     highlighted, and starts with focus on **Cancel**, so a stray Enter never writes.
7. **Concurrent notes:** if `notes` changed in HubSpot after the drawer loaded, the write is refused (409).
   The drawer shows the latest text with an amber notice and nothing is lost.
8. **Quiet flags, no loud banners (CRO rule):**
   - Data gaps show as ⚑ with the reason on hover: blank territory status, unmapped accounts, and the
     in-memory dev store.
9. **Data Hygiene tab:** sits after Out of Territory. A flat list (no tier sections) of accounts with
   a blank Territory or Territory Status, with the two properties as dropdowns of HubSpot's options.
   A picked value turns the select blue until saved; × discards it. One confirmed write per company
   rather than a bulk write, so each change is reviewed. A saved row leaves the tab once both values
   are set. The same Owner / Outreach filters apply. Columns are kept to what the task needs
   (Casey, 2026-10-01): Company Name, Company Owner, Territory, Territory Status, Save, Notes.
10. **Per-viewer conveniences:** the selected tab, the column sort and collapsed sections are kept in `localStorage`.
   Everything shared (tier, outreach, revisit) is in Redis.
