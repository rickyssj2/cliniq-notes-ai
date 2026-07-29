import { useEffect, useState } from "react";
import { NOTE_STATUSES, type NoteStatus } from "@soulside/domain";
import { useDevUsersQuery, type NotesFilterState } from "@entities/note";
import { useDebouncedValue } from "@shared/lib";
import { Button } from "@shared/ui/button";

type Props = {
  filters: NotesFilterState;
  onChange: (patch: Partial<NotesFilterState>) => void;
  onClear: () => void;
};

export function NotesFilters({ filters, onChange, onClear }: Props) {
  const [searchDraft, setSearchDraft] = useState(filters.q);
  const debouncedSearch = useDebouncedValue(searchDraft, 300);
  const { data: users = [] } = useDevUsersQuery();

  useEffect(() => {
    setSearchDraft(filters.q);
  }, [filters.q]);

  useEffect(() => {
    if (debouncedSearch !== filters.q) {
      onChange({ q: debouncedSearch });
    }
  }, [debouncedSearch, filters.q, onChange]);

  const reviewers = users.filter((u) => u.role === "REVIEWER");

  const toggleStatus = (status: NoteStatus) => {
    const set = new Set(filters.statuses);
    if (set.has(status)) set.delete(status);
    else set.add(status);
    onChange({ statuses: [...set] });
  };

  return (
    <section className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Filters</h2>
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
      </div>

      <label className="block text-sm">
        Search patient / content
        <input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Debounced server search…"
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
        />
      </label>

      <fieldset>
        <legend className="text-sm">Status</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {NOTE_STATUSES.map((status) => {
            const on = filters.statuses.includes(status);
            return (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatus(status)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  on
                    ? "border-[var(--accent)] bg-teal-50 text-teal-900"
                    : "border-[var(--border)] bg-white text-[var(--muted)]"
                }`}
              >
                {status}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Reviewer
          <select
            value={filters.reviewerId}
            onChange={(e) => onChange({ reviewerId: e.target.value })}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2 py-2 text-sm"
          >
            <option value="">Any</option>
            {reviewers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          Patient id
          <input
            value={filters.patientId}
            onChange={(e) => onChange({ patientId: e.target.value })}
            placeholder="pat_0001"
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-sm">
          Updated from
          <input
            type="date"
            value={filters.updatedFrom.slice(0, 10)}
            onChange={(e) =>
              onChange({
                updatedFrom: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : "",
              })
            }
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-sm">
          Updated to
          <input
            type="date"
            value={filters.updatedTo.slice(0, 10)}
            onChange={(e) =>
              onChange({
                updatedTo: e.target.value
                  ? new Date(`${e.target.value}T23:59:59.999Z`).toISOString()
                  : "",
              })
            }
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>
    </section>
  );
}
