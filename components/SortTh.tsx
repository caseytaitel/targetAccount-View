"use client";

import { type Sort, type SortKey } from "@/lib/sort";

/**
 * A sortable column header. Black carets: both shown (stacked) when the column isn't sorted,
 * only the active direction when it is. The whole header is the click target.
 */
export default function SortTh({
  k,
  label,
  sort,
  onSort,
  right,
}: {
  k: SortKey;
  label: string;
  sort: Sort;
  onSort: (k: SortKey) => void;
  right?: boolean;
}) {
  const active = sort.key === k;
  const ariaSort = active ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th className={right ? "r" : undefined} aria-sort={ariaSort}>
      <button className={`sort-btn${active ? " active" : ""}`} onClick={() => onSort(k)}>
        {label}
        <span className={`caret${active ? ` caret-${sort.dir}` : ""}`} aria-hidden="true">
          <span className="caret-up">▲</span>
          <span className="caret-down">▼</span>
        </span>
      </button>
    </th>
  );
}
