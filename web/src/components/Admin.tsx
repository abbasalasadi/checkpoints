/**
 * Admin view (V5, D36-D39): the application's usage and performance, for admin
 * accounts only. Read-only; no student code. Names only in Online now (D40)
 * and the user summaries (D41). Same cards, colours and spacing as the
 * dashboard (D38).
 */
import { useEffect, useState } from "react";
import {
  api,
  type AdminOverview,
  type AdminRange,
  type AdminUserProfile,
  type AdminUserRow,
  type Language,
} from "../lib/api.js";
import { LANGUAGE_LABEL, ago } from "../lib/format.js";
import { logger } from "../logger.js";
import { LOCATION_CHANGE } from "../lib/route.js";
import { MarkRing, fmtPercent } from "./MarkRing.js";
import { Modal } from "./Modal.js";
import { Skeleton } from "./Skeleton.js";

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "1rem 1.1rem",
  display: "flex",
  flexDirection: "column",
  gap: ".7rem",
  minWidth: 0,
};
const h2: React.CSSProperties = { margin: 0, fontSize: "1rem" };
const muted: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: ".8rem",
};
const num: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

const LANG_COLOR: Record<Language, string> = {
  go: "#00add8",
  js: "#e0a33a",
  rust: "#f0736a",
  java: "#a78bfa",
};
const RANGE_LABEL: Record<AdminRange, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
};

const fmtInt = (n: number) => n.toLocaleString("en-US");
const fmtMs = (ms: number | null) =>
  ms === null ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
const fmtPct = (f: number) => `${(f * 100).toFixed(f && f < 0.01 ? 2 : 1)}%`;
const fmtBytes = (b: number) =>
  b < 1048576
    ? `${(b / 1024).toFixed(0)} KB`
    : `${(b / 1048576).toFixed(1)} MB`;
function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div style={{ ...card, gap: ".25rem", padding: ".85rem 1rem" }}>
      <span style={muted}>{label}</span>
      <strong style={{ ...num, fontSize: "1.45rem", lineHeight: 1.15 }}>
        {value}
      </strong>
      {hint && (
        <span
          style={{ ...muted, fontSize: ".74rem", color: "var(--text-dim)" }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div
      style={{
        display: "flex",
        gap: ".9rem",
        flexWrap: "wrap",
        fontSize: ".78rem",
        color: "var(--text-muted)",
      }}
    >
      {items.map((i) => (
        <span
          key={i.label}
          style={{ display: "flex", alignItems: "center", gap: ".35rem" }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 9,
              background: i.color,
            }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** A round axis maximum (1, 2, 5 x 10^n) at or above n. */
function niceMax(n: number): number {
  if (n <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 5, 10]) if (m * p >= n) return m * p;
  return 10 * p;
}

const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

/** Stacked bars, runs and submits per day, with a count axis and a date axis. */
function DailyChart({ days }: { days: AdminOverview["usage"]["days"] }) {
  const top = niceMax(Math.max(0, ...days.map((d) => d.runs + d.submits)));
  const ticks = [top, (top * 3) / 4, top / 2, top / 4, 0];
  // Label every day for a week; for 30 days, about six labels.
  const every = days.length <= 8 ? 1 : Math.ceil(days.length / 6);
  const H = 170;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gridTemplateRows: `${H}px auto auto`,
        columnGap: ".5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: "flex-end",
          ...muted,
          fontSize: ".72rem",
          ...num,
          transform: "translateY(-.45em)",
          height: H,
        }}
      >
        {ticks.map((t) => (
          <span key={t} style={{ lineHeight: 1 }}>
            {fmtInt(Math.round(t))}
          </span>
        ))}
      </div>
      <div
        style={{
          position: "relative",
          height: H,
          borderLeft: "1px solid var(--border-strong)",
          borderBottom: "1px solid var(--border-strong)",
        }}
      >
        {ticks.slice(0, -1).map((t) => (
          <div
            key={t}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${(1 - t / top) * 100}%`,
              borderTop: "1px dashed var(--border)",
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "flex-end",
            gap: days.length > 14 ? 2 : 6,
            padding: "0 4px",
          }}
        >
          {days.map((d) => (
            <div
              key={d.day}
              title={`${shortDay(d.day)}: ${fmtInt(d.runs)} runs, ${fmtInt(d.submits)} submits`}
              style={{
                flex: 1,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  height: `${(d.runs / top) * 100}%`,
                  background: "var(--border-strong)",
                  borderRadius: "3px 3px 0 0",
                }}
              />
              <div
                style={{
                  height: `${(d.submits / top) * 100}%`,
                  background:
                    "linear-gradient(180deg, var(--success), var(--accent))",
                  borderRadius: d.runs ? 0 : "3px 3px 0 0",
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <span />
      <div
        style={{
          display: "flex",
          gap: days.length > 14 ? 2 : 6,
          padding: "0 4px",
          marginTop: ".35rem",
        }}
      >
        {days.map((d, i) => (
          <span
            key={d.day}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "center",
              ...muted,
              fontSize: ".7rem",
              whiteSpace: "nowrap",
              overflow: "visible",
            }}
          >
            {i % every === 0 ? shortDay(d.day) : ""}
          </span>
        ))}
      </div>
      <span />
      <span
        style={{
          ...muted,
          fontSize: ".72rem",
          textAlign: "center",
          marginTop: ".2rem",
        }}
      >
        Day (UTC)
      </span>
    </div>
  );
}

function HoursChart({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours);
  return (
    <div>
      <div
        style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 90 }}
      >
        {hours.map((n, h) => (
          <div
            key={h}
            title={`${String(h).padStart(2, "0")}:00 UTC — ${fmtInt(n)}`}
            style={{
              flex: 1,
              height: `${Math.max(2, (n / max) * 100)}%`,
              borderRadius: 3,
              background:
                n === max && n > 0 ? "var(--accent-text)" : "var(--accent)",
              opacity: n ? 1 : 0.25,
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          ...muted,
          fontSize: ".72rem",
          marginTop: ".3rem",
        }}
      >
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00 UTC</span>
      </div>
    </div>
  );
}

function LanguageTable({
  rows,
}: {
  rows: AdminOverview["performance"]["languages"];
}) {
  const th: React.CSSProperties = {
    textAlign: "right",
    fontWeight: 500,
    color: "var(--text-muted)",
    padding: ".35rem .5rem",
    whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    ...num,
    textAlign: "right",
    padding: ".45rem .5rem",
    borderTop: "1px solid var(--border)",
    whiteSpace: "nowrap",
  };
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: ".84rem",
        }}
      >
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Language</th>
            <th style={th}>Runs</th>
            <th style={th}>Submits</th>
            <th style={th}>Typical time</th>
            <th style={th}>Slowest 5%</th>
            <th style={th}>System failures</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.language}>
              <td style={{ ...td, textAlign: "left" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: ".45rem",
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 9,
                      background: LANG_COLOR[r.language],
                    }}
                  />
                  {LANGUAGE_LABEL[r.language]}
                </span>
              </td>
              <td style={td}>{fmtInt(r.runs)}</td>
              <td style={td}>{fmtInt(r.submits)}</td>
              <td style={td}>{fmtMs(r.medianMs)}</td>
              <td style={td}>{fmtMs(r.p95Ms)}</td>
              <td
                style={{
                  ...td,
                  color:
                    r.systemFailureRate > 0.05
                      ? "var(--danger)"
                      : r.systemFailureRate > 0.01
                        ? "var(--warning)"
                        : "var(--success)",
                }}
              >
                {fmtPct(r.systemFailureRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TOP = 10;

function TopExercises({
  rows,
  all,
}: {
  rows: AdminOverview["usage"]["topExercises"];
  all: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.attempts));
  if (!rows.length)
    return <p style={{ ...muted, margin: 0 }}>No activity in this range.</p>;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: ".45rem",
        ...(all
          ? { maxHeight: "26rem", overflowY: "auto", paddingRight: ".3rem" }
          : {}),
      }}
    >
      {(all ? rows : rows.slice(0, TOP)).map((r) => (
        <div
          key={`${r.language}/${r.slug}`}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: ".2rem .7rem",
            fontSize: ".82rem",
          }}
        >
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: "var(--text-dim)" }}>
              {LANGUAGE_LABEL[r.language]} ·{" "}
            </span>
            {r.slug}
          </span>
          <span style={{ ...num, color: "var(--text-muted)" }}>
            {fmtInt(r.attempts)} · {fmtInt(r.passes)} passed
          </span>
          <div
            style={{
              gridColumn: "1 / -1",
              height: 6,
              background: "var(--raised)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(r.attempts / max) * 100}%`,
                height: "100%",
                background: LANG_COLOR[r.language],
                borderRadius: 6,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function OnlineNow({
  rows,
  onOpen,
}: {
  rows: AdminOverview["online"];
  onOpen: (username: string) => void;
}) {
  if (!rows.length)
    return <p style={{ ...muted, margin: 0 }}>Nobody is online right now.</p>;
  const cell: React.CSSProperties = {
    padding: ".45rem .5rem",
    borderTop: "1px solid var(--border)",
    whiteSpace: "nowrap",
    verticalAlign: "middle",
  };
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: ".84rem",
        }}
      >
        <thead>
          <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
            {["Student", "Doing", "Seen"].map((h, i) => (
              <th
                key={h}
                style={{
                  fontWeight: 500,
                  padding: ".3rem .5rem",
                  textAlign: i === 2 ? "right" : "left",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.username}>
              <td style={{ ...cell, width: "30%" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: ".55rem",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 8,
                      background: "var(--success)",
                      boxShadow: "0 0 6px var(--success)",
                      flex: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => onOpen(o.username)}
                    title={`Open ${o.username}`}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--accent-text)",
                      font: "inherit",
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {o.username}
                  </button>
                </span>
              </td>
              <td style={{ ...cell, whiteSpace: "normal" }}>
                {o.inExam ? (
                  <span style={{ color: "var(--warning, var(--text))" }}>
                    In a mock exam
                  </span>
                ) : o.language && o.slug ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: ".45rem",
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: LANG_COLOR[o.language],
                        flex: "none",
                      }}
                    />
                    <span>{LANGUAGE_LABEL[o.language]}</span>
                    <code style={{ color: "var(--text-muted)" }}>{o.slug}</code>
                  </span>
                ) : (
                  <span style={{ color: "var(--text-dim)" }}>Browsing</span>
                )}
              </td>
              <td
                style={{
                  ...cell,
                  textAlign: "right",
                  color: "var(--text-muted)",
                  ...num,
                }}
              >
                {ago(o.lastSeenAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type SortKey =
  | "username"
  | "lastActiveAt"
  | "submits"
  | "passRate"
  | "exercisesPassed"
  | "exams";
const SORTS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "username", label: "Student", numeric: false },
  { key: "lastActiveAt", label: "Last active", numeric: true },
  { key: "submits", label: "Submits", numeric: true },
  { key: "passRate", label: "Pass rate", numeric: true },
  { key: "exercisesPassed", label: "Exercises passed", numeric: true },
  { key: "exams", label: "Exams", numeric: true },
];
const passRate = (u: AdminUserRow) =>
  u.submits ? u.submitsPassed / u.submits : 0;
const USERS_PAGE = 25;

/** Every student in summary: submissions and exams (D41). */
type Activity = "all" | "today" | "7d" | "30d" | "inactive";
const ACTIVITY: [Activity, string][] = [
  ["all", "Any activity"],
  ["today", "Active today"],
  ["7d", "Active in 7 days"],
  ["30d", "Active in 30 days"],
  ["inactive", "Inactive 30+ days"],
];
function matchesActivity(at: string | null, a: Activity): boolean {
  if (a === "all") return true;
  const t = at ? Date.parse(at) : 0;
  const now = new Date();
  const day = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  if (a === "today") return t >= day;
  if (a === "7d") return t >= Date.now() - 7 * 86400000;
  if (a === "30d") return t >= Date.now() - 30 * 86400000;
  return t < Date.now() - 30 * 86400000;
}

function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      style={{
        background:
          value === options[0]![0]
            ? "var(--raised)"
            : "var(--accent-soft, var(--raised))",
        color: "var(--text)",
        border: `1px solid ${value === options[0]![0] ? "var(--border-strong)" : "var(--accent)"}`,
        borderRadius: "var(--radius)",
        padding: ".4rem .5rem",
        font: "inherit",
        fontSize: ".82rem",
        cursor: "pointer",
      }}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function Users({ onOpen }: { onOpen: (username: string) => void }) {
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "lastActiveAt",
    desc: true,
  });
  const [shown, setShown] = useState(USERS_PAGE);
  const [lang, setLang] = useState<"all" | Language>("all");
  const [activity, setActivity] = useState<Activity>("all");
  const [exams, setExams] = useState<"all" | "yes" | "no">("all");
  const [result, setResult] = useState<"all" | "passed" | "none">("all");
  useEffect(() => {
    api
      .adminUsers()
      .then((r) => setRows(r.users))
      .catch((err) => {
        logger.warn("admin.users_failed", { error: String(err) });
        setRows([]);
      });
  }, []);
  if (!rows) return <Skeleton height="14rem" />;
  const value = (u: AdminUserRow, k: SortKey): string | number =>
    k === "passRate"
      ? passRate(u)
      : k === "lastActiveAt"
        ? (u.lastActiveAt ?? "")
        : u[k];
  const filtered = rows
    .filter((u) => u.username.includes(q.trim().toLowerCase()))
    .filter((u) => lang === "all" || u.languages.includes(lang))
    .filter((u) => matchesActivity(u.lastActiveAt, activity))
    .filter(
      (u) => exams === "all" || (exams === "yes" ? u.exams > 0 : u.exams === 0),
    )
    .filter(
      (u) =>
        result === "all" ||
        (result === "passed" ? u.exercisesPassed > 0 : u.exercisesPassed === 0),
    )
    .sort((a, b) => {
      const x = value(a, sort.key);
      const y = value(b, sort.key);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return sort.desc ? -c : c;
    });
  const th: React.CSSProperties = {
    fontWeight: 500,
    color: "var(--text-muted)",
    padding: ".35rem .5rem",
    whiteSpace: "nowrap",
    textAlign: "right",
  };
  const td: React.CSSProperties = {
    ...num,
    textAlign: "right",
    padding: ".45rem .5rem",
    borderTop: "1px solid var(--border)",
    whiteSpace: "nowrap",
  };
  const reset = () => setShown(USERS_PAGE);
  const filtering =
    lang !== "all" ||
    activity !== "all" ||
    exams !== "all" ||
    result !== "all" ||
    q !== "";
  return (
    <>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: ".5rem",
          alignItems: "center",
        }}
      >
        <input
          type="search"
          placeholder="Search by username"
          aria-label="Search by username"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setShown(USERS_PAGE);
          }}
          style={{
            background: "var(--raised)",
            color: "var(--text)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius)",
            padding: ".4rem .65rem",
            font: "inherit",
            fontSize: ".84rem",
            flex: "1 1 200px",
            maxWidth: 280,
          }}
        />
        <Select
          label="Language"
          value={lang}
          onChange={(v) => (setLang(v), reset())}
          options={[
            ["all", "All languages"],
            ["go", "Go"],
            ["js", "JS"],
            ["rust", "Rust"],
            ["java", "Java"],
          ]}
        />
        <Select
          label="Activity"
          value={activity}
          onChange={(v) => (setActivity(v), reset())}
          options={ACTIVITY}
        />
        <Select
          label="Exercises"
          value={result}
          onChange={(v) => (setResult(v), reset())}
          options={[
            ["all", "Any exercises"],
            ["passed", "Passed at least one"],
            ["none", "None passed"],
          ]}
        />
        <Select
          label="Mock exams"
          value={exams}
          onChange={(v) => (setExams(v), reset())}
          options={[
            ["all", "Any exams"],
            ["yes", "Took an exam"],
            ["no", "No exams"],
          ]}
        />
        {filtering && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setLang("all");
              setActivity("all");
              setExams("all");
              setResult("all");
              reset();
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--accent-text)",
              font: "inherit",
              fontSize: ".82rem",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: ".84rem",
          }}
        >
          <thead>
            <tr>
              {SORTS.map((c) => (
                <th
                  key={c.key}
                  style={{ ...th, textAlign: c.numeric ? "right" : "left" }}
                  aria-sort={
                    sort.key === c.key
                      ? sort.desc
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSort((s) => ({
                        key: c.key,
                        desc: s.key === c.key ? !s.desc : c.numeric,
                      }))
                    }
                    style={{
                      background: "transparent",
                      border: "none",
                      color: sort.key === c.key ? "var(--text)" : "inherit",
                      font: "inherit",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {c.label}
                    {sort.key === c.key ? (sort.desc ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, shown).map((u) => (
              <tr
                key={u.username}
                onClick={() => onOpen(u.username)}
                style={{ cursor: "pointer" }}
                title={`Open ${u.username}`}
              >
                <td style={{ ...td, textAlign: "left" }}>
                  <button
                    type="button"
                    onClick={(e) => (e.stopPropagation(), onOpen(u.username))}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--accent-text)",
                      font: "inherit",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {u.username}
                  </button>
                </td>
                <td style={{ ...td, color: "var(--text-muted)" }}>
                  {u.lastActiveAt ? ago(u.lastActiveAt) : "—"}
                </td>
                <td style={td}>{fmtInt(u.submits)}</td>
                <td style={td}>{u.submits ? fmtPct(passRate(u)) : "—"}</td>
                <td style={td}>{fmtInt(u.exercisesPassed)}</td>
                <td style={td}>{fmtInt(u.exams)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          ...muted,
        }}
      >
        <span>
          {Math.min(shown, filtered.length)} of {filtered.length} students
        </span>
        {filtered.length > shown && (
          <button
            type="button"
            onClick={() => setShown((n) => n + USERS_PAGE * 4)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--accent-text)",
              font: "inherit",
              fontSize: ".84rem",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Show more →
          </button>
        )}
      </div>
    </>
  );
}

const EXAM_STATUS: Record<string, string> = {
  finished: "Finished",
  expired: "Time ran out",
  abandoned: "Left early",
  active: "Running",
};

/** One student in summary: per-language results and exam results (D41). */
function UserProfile({
  username,
  onClose,
}: {
  username: string | null;
  onClose: () => void;
}) {
  const [p, setP] = useState<AdminUserProfile | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!username) return;
    setP(null);
    setFailed(false);
    api
      .adminUser(username)
      .then(setP)
      .catch(() => setFailed(true));
  }, [username]);
  const tracks = p?.tracks.filter((t) => t.submits || t.runs || t.passed) ?? [];
  return (
    <Modal
      open={username !== null}
      onClose={onClose}
      labelledBy="admin-user-title"
      width="44rem"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <h2 id="admin-user-title" style={{ margin: 0, fontSize: "1.15rem" }}>
            {username}
          </h2>
          {p && (
            <span style={muted}>
              Joined{" "}
              {new Date(p.joinedAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              {p.lastActiveAt ? ` · last active ${ago(p.lastActiveAt)}` : ""}
            </span>
          )}
        </div>
        {failed && (
          <p style={{ color: "var(--danger)", margin: 0 }}>
            This profile could not load.
          </p>
        )}
        {!p && !failed && <Skeleton height="12rem" />}
        {p && (
          <>
            <section aria-label="Exercises">
              <h3 style={{ margin: "0 0 .6rem", fontSize: ".95rem" }}>
                Exercises
              </h3>
              {tracks.length === 0 ? (
                <p style={{ ...muted, margin: 0 }}>No submissions yet.</p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                    gap: ".7rem",
                  }}
                >
                  {tracks.map((t) => (
                    <div
                      key={t.language}
                      style={{
                        ...card,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: ".8rem",
                        padding: ".7rem .8rem",
                        background: "var(--raised)",
                      }}
                    >
                      <MarkRing
                        id={`adm-u-${t.language}`}
                        size={64}
                        label={fmtPercent(t.progress)}
                        caption={`${LANGUAGE_LABEL[t.language]} progress`}
                        rings={[
                          {
                            value: t.progress,
                            from: "var(--accent)",
                            to: "var(--success)",
                          },
                        ]}
                      />
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: ".15rem",
                          fontSize: ".8rem",
                          minWidth: 0,
                        }}
                      >
                        <strong style={{ fontSize: ".9rem" }}>
                          {LANGUAGE_LABEL[t.language]}
                        </strong>
                        <span style={num}>
                          {t.passed} of {t.total} passed
                        </span>
                        <span style={{ ...num, color: "var(--text-muted)" }}>
                          {fmtInt(t.submits)} submits ·{" "}
                          {t.submits
                            ? fmtPct(t.submitsPassed / t.submits)
                            : "—"}{" "}
                          passed
                        </span>
                        {t.lastAt && (
                          <span style={{ color: "var(--text-dim)" }}>
                            last {ago(t.lastAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section aria-label="Mock exams">
              <h3 style={{ margin: "0 0 .6rem", fontSize: ".95rem" }}>
                Mock exams
              </h3>
              {p.exams.length === 0 ? (
                <p style={{ ...muted, margin: 0 }}>No mock exams yet.</p>
              ) : (
                <div
                  style={{
                    overflowX: "auto",
                    maxHeight: "18rem",
                    overflowY: "auto",
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: ".82rem",
                    }}
                  >
                    <thead>
                      <tr style={{ color: "var(--text-muted)" }}>
                        {["Date", "Exam", "Levels", "Mark", "Result"].map(
                          (h, i) => (
                            <th
                              key={h}
                              style={{
                                fontWeight: 500,
                                padding: ".3rem .5rem",
                                textAlign:
                                  i === 0 || i === 1 ? "left" : "right",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {p.exams.map((e) => (
                        <tr key={e.startedAt}>
                          <td
                            style={{
                              padding: ".4rem .5rem",
                              borderTop: "1px solid var(--border)",
                              whiteSpace: "nowrap",
                              color: "var(--text-muted)",
                            }}
                          >
                            {new Date(e.startedAt).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                            })}
                          </td>
                          <td
                            style={{
                              padding: ".4rem .5rem",
                              borderTop: "1px solid var(--border)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {LANGUAGE_LABEL[e.language]} · {e.checkpoint}{" "}
                            <span style={{ color: "var(--text-dim)" }}>
                              ({e.minutes} min)
                            </span>
                          </td>
                          <td
                            style={{
                              ...num,
                              padding: ".4rem .5rem",
                              borderTop: "1px solid var(--border)",
                              textAlign: "right",
                            }}
                          >
                            {e.levelsPassed}/{e.levels}
                          </td>
                          <td
                            style={{
                              ...num,
                              padding: ".4rem .5rem",
                              borderTop: "1px solid var(--border)",
                              textAlign: "right",
                              fontWeight: 600,
                            }}
                          >
                            {e.mark === null ? "—" : fmtPercent(e.mark)}
                          </td>
                          <td
                            style={{
                              padding: ".4rem .5rem",
                              borderTop: "1px solid var(--border)",
                              textAlign: "right",
                              color:
                                e.status === "finished"
                                  ? "var(--success)"
                                  : "var(--text-muted)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {EXAM_STATUS[e.status] ?? e.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              color: "var(--text)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius)",
              padding: ".4rem .9rem",
              font: "inherit",
              fontSize: ".84rem",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

type Sample = AdminOverview["server"]["history"][number];
type SeriesKey = "rssMb" | "heapMb" | "cpuPct" | "load1";

/** A small SVG line chart over time with y ticks and start/end times. */
function LineChart({
  points,
  series,
  unit,
}: {
  points: Sample[];
  series: { key: SeriesKey; color: string }[];
  unit: string;
}) {
  const W = 600;
  const H = 160;
  const L = 42;
  const B = 20;
  const values = points.flatMap((p) => series.map((s) => p[s.key]));
  const max = niceMax(Math.max(1, ...values));
  const n = points.length;
  const x = (i: number) =>
    L + (n <= 1 ? (W - L) / 2 : (i / (n - 1)) * (W - L - 4));
  const y = (v: number) => 6 + (1 - v / max) * (H - B - 6);
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  const last = points.at(-1);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`Chart over the last ${n} minutes`}
      style={{ display: "block" }}
    >
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1={L}
            x2={W}
            y1={y(max * f)}
            y2={y(max * f)}
            stroke="var(--border)"
            strokeDasharray={f ? "3 4" : undefined}
          />
          <text
            x={L - 6}
            y={y(max * f) + 4}
            textAnchor="end"
            fontSize="11"
            fill="var(--text-dim)"
          >
            {Math.round(max * f * 10) / 10}
          </text>
        </g>
      ))}
      {series.map((s) =>
        n === 1 ? (
          <circle
            key={s.key}
            cx={x(0)}
            cy={y(points[0]![s.key])}
            r={3}
            fill={s.color}
          />
        ) : (
          <polyline
            key={s.key}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            points={points.map((p, i) => `${x(i)},${y(p[s.key])}`).join(" ")}
          />
        ),
      )}
      {points[0] && (
        <text x={L} y={H - 4} fontSize="11" fill="var(--text-dim)">
          {time(points[0].at)}
        </text>
      )}
      {last && n > 1 && (
        <text
          x={W}
          y={H - 4}
          textAnchor="end"
          fontSize="11"
          fill="var(--text-dim)"
        >
          {time(last.at)} · now{" "}
          {series.map((s) => `${last[s.key]}${unit}`).join(" / ")}
        </text>
      )}
    </svg>
  );
}

function BackupBars({ rows }: { rows: AdminOverview["server"]["backups"] }) {
  if (!rows.length)
    return <p style={{ ...muted, margin: 0 }}>No backups found.</p>;
  const max = Math.max(1, ...rows.map((r) => r.sizeBytes));
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: ".35rem",
        height: "8.5rem",
      }}
    >
      {rows.map((r) => (
        <div
          key={r.at}
          title={`${new Date(r.at).toLocaleString("en-GB")} · ${fmtBytes(r.sizeBytes)}`}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: ".25rem",
            height: "100%",
            justifyContent: "flex-end",
            minWidth: 0,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 28,
              height: `${Math.max(4, (r.sizeBytes / max) * 100)}%`,
              background:
                "linear-gradient(180deg, var(--accent), var(--success))",
              borderRadius: 3,
            }}
          />
          <span
            style={{
              fontSize: ".66rem",
              color: "var(--text-dim)",
              whiteSpace: "nowrap",
            }}
          >
            {new Date(r.at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

type AdminTab = "usage" | "students" | "server";
const TABS: { key: AdminTab; label: string }[] = [
  { key: "usage", label: "Usage" },
  { key: "students", label: "Students" },
  { key: "server", label: "Server" },
];

/** Page sections; the range applies to Usage only. */
function AdminTabs({
  value,
  onChange,
}: {
  value: AdminTab;
  onChange: (t: AdminTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Admin sections"
      style={{
        display: "flex",
        gap: "1.2rem",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: `2px solid ${value === t.key ? "var(--accent)" : "transparent"}`,
            color: value === t.key ? "var(--text)" : "var(--text-muted)",
            font: "inherit",
            fontSize: ".9rem",
            fontWeight: value === t.key ? 600 : 400,
            padding: ".45rem .1rem",
            marginBottom: -1,
            cursor: "pointer",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function RangePicker({
  value,
  onChange,
}: {
  value: AdminRange;
  onChange: (r: AdminRange) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Range"
      style={{
        display: "flex",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
      }}
    >
      {(Object.keys(RANGE_LABEL) as AdminRange[]).map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={value === r}
          onClick={() => onChange(r)}
          style={{
            background: value === r ? "var(--accent)" : "transparent",
            color: value === r ? "#fff" : "var(--text-muted)",
            border: "none",
            font: "inherit",
            fontSize: ".82rem",
            padding: ".35rem .8rem",
            cursor: "pointer",
          }}
        >
          {RANGE_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

const EX_TABS: ("all" | Language)[] = ["all", "go", "js", "rust", "java"];

interface AdminView {
  tab: AdminTab;
  range: AdminRange;
  user: string | null;
}
const RANGE_KEYS = Object.keys(RANGE_LABEL) as AdminRange[];
const USER = /^[A-Za-z0-9._-]{1,64}$/;

/** /admin[?range=], /admin/students[/name], /admin/server (D44). */
function readAdmin(): AdminView {
  const [, sub, name] = window.location.pathname.split("/").filter(Boolean);
  const r = new URLSearchParams(window.location.search).get(
    "range",
  ) as AdminRange | null;
  const range = r && RANGE_KEYS.includes(r) ? r : "7d";
  if (sub === "students") {
    let user: string | null = null;
    try {
      user = name ? decodeURIComponent(name) : null;
    } catch {
      user = null;
    }
    return {
      tab: "students",
      range,
      user: user && USER.test(user) ? user : null,
    };
  }
  return { tab: sub === "server" ? "server" : "usage", range, user: null };
}

function adminPath(v: AdminView): string {
  if (v.tab === "students")
    return v.user
      ? `/admin/students/${encodeURIComponent(v.user)}`
      : "/admin/students";
  if (v.tab === "server") return "/admin/server";
  return v.range === "7d" ? "/admin" : `/admin?range=${v.range}`;
}

export function Admin() {
  const [view, setView] = useState<AdminView>(readAdmin);
  const { range, tab, user: profile } = view;
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState(false);
  const [allExercises, setAllExercises] = useState(false);
  const [exLang, setExLang] = useState<"all" | Language>("all");
  useEffect(() => {
    const sync = () => setView(readAdmin());
    window.addEventListener("popstate", sync);
    window.addEventListener(LOCATION_CHANGE, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(LOCATION_CHANGE, sync);
    };
  }, []);
  // Every tab, range and opened student is a history entry (D44).
  const go = (change: Partial<AdminView>) => {
    const next = { ...view, ...change };
    const path = adminPath(next);
    if (path !== window.location.pathname + window.location.search)
      window.history.pushState({ page: "admin" }, "", path);
    setView(next);
  };
  const setTab = (t: AdminTab) => go({ tab: t, user: null });
  const setRange = (r: AdminRange) => go({ range: r });
  const setProfile = (u: string | null) =>
    go(u ? { tab: "students", user: u } : { user: null });

  useEffect(() => {
    let live = true;
    setData(null);
    setError(false);
    api
      .adminOverview(range)
      .then((d) => live && setData(d))
      .catch((err) => {
        logger.warn("admin.load_failed", { error: String(err) });
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [range]);

  const grid = (min: number): React.CSSProperties => ({
    display: "grid",
    gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
    gap: "1rem",
  });
  const u = data?.usage;
  const ex = (u?.topExercises ?? []).filter(
    (r) => exLang === "all" || r.language === exLang,
  );
  const p = data?.performance;
  const s = data?.server;

  return (
    <main style={{ flex: 1, overflowY: "auto", padding: "1.2rem 1rem 2rem" }}>
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "1.4rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "1.2rem" }}>Admin</h1>
            <span style={muted}>
              {tab === "usage"
                ? "Usage and performance in the chosen range"
                : tab === "students"
                  ? "Students, activity and summaries"
                  : "Server health"}
              {data ? ` · updated ${ago(data.generatedAt)}` : ""}
            </span>
          </div>
          {tab === "usage" && <RangePicker value={range} onChange={setRange} />}
        </div>

        <AdminTabs value={tab} onChange={setTab} />

        {error && (
          <p style={{ color: "var(--danger)", margin: 0 }}>
            The admin view could not load. Reload the page to try again.
          </p>
        )}

        {tab === "usage" && (
          <>
            <section aria-label="Usage" style={grid(160)}>
              {u ? (
                <>
                  <Tile
                    label="New accounts"
                    value={fmtInt(u.newAccounts)}
                    hint={RANGE_LABEL[range]}
                  />
                  <Tile
                    label="Runs"
                    value={fmtInt(u.runs)}
                    hint={RANGE_LABEL[range]}
                  />
                  <Tile
                    label="Submits"
                    value={fmtInt(u.submits)}
                    hint={RANGE_LABEL[range]}
                  />
                </>
              ) : (
                !error &&
                [0, 1, 2].map((i) => <Skeleton key={i} height="5.4rem" />)
              )}
            </section>

            <section style={card} aria-label="Runs and submits per day">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <h2 style={h2}>Runs and submits per day</h2>
                <Legend
                  items={[
                    { color: "var(--border-strong)", label: "Runs" },
                    {
                      color:
                        "linear-gradient(135deg, var(--accent), var(--success))",
                      label: "Submits",
                    },
                  ]}
                />
              </div>
              {u ? <DailyChart days={u.days} /> : <Skeleton height="10rem" />}
            </section>

            <section style={card} aria-label="Performance by language">
              <h2 style={h2}>Performance by language</h2>
              <span style={muted}>
                Typical time is the median run or submit; system failures are
                timeouts and runner errors, not wrong answers.
              </span>
              {p ? (
                <LanguageTable rows={p.languages} />
              ) : (
                <Skeleton height="9rem" />
              )}
            </section>

            <div style={grid(320)}>
              <section style={card} aria-label="Most used exercises">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  <h2 style={h2}>
                    Most used exercises
                    {u && allExercises ? ` (${ex.length})` : ""}
                  </h2>
                  {u && ex.length > TOP && (
                    <button
                      type="button"
                      onClick={() => setAllExercises((v) => !v)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--accent-text)",
                        font: "inherit",
                        fontSize: ".84rem",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      {allExercises ? "Show top 10" : `See all ${ex.length} →`}
                    </button>
                  )}
                </div>
                <div
                  role="tablist"
                  aria-label="Exercise language"
                  style={{ display: "flex", gap: ".35rem", flexWrap: "wrap" }}
                >
                  {EX_TABS.map((l) => (
                    <button
                      key={l}
                      type="button"
                      role="tab"
                      aria-selected={exLang === l}
                      onClick={() => setExLang(l)}
                      style={{
                        background:
                          exLang === l ? "var(--accent)" : "transparent",
                        color: exLang === l ? "#fff" : "var(--text-muted)",
                        border: "1px solid var(--border-strong)",
                        borderRadius: 999,
                        font: "inherit",
                        fontSize: ".78rem",
                        padding: ".2rem .7rem",
                        cursor: "pointer",
                      }}
                    >
                      {l === "all" ? "All" : LANGUAGE_LABEL[l]}
                    </button>
                  ))}
                </div>
                {u ? (
                  <TopExercises rows={ex} all={allExercises} />
                ) : (
                  <Skeleton height="12rem" />
                )}
              </section>
              <section style={card} aria-label="Busiest hours">
                <h2 style={h2}>Busiest hours</h2>
                <span style={muted}>Runs and submits by hour of the day.</span>
                {p ? (
                  <HoursChart hours={p.busiestHours} />
                ) : (
                  <Skeleton height="6rem" />
                )}
              </section>
            </div>

            <section style={card} aria-label="Mock exams">
              <h2 style={h2}>Mock exams</h2>
              {u ? (
                <div style={grid(110)}>
                  <Tile label="Started" value={fmtInt(u.exams.started)} />
                  <Tile label="Finished" value={fmtInt(u.exams.finished)} />
                  <Tile label="Expired" value={fmtInt(u.exams.expired)} />
                  <Tile label="Left early" value={fmtInt(u.exams.abandoned)} />
                  <Tile label="Running now" value={fmtInt(u.exams.active)} />
                </div>
              ) : (
                <Skeleton height="6rem" />
              )}
            </section>
          </>
        )}

        {tab === "server" && (
          <>
            <section aria-label="Server" style={grid(160)}>
              {s ? (
                <>
                  <Tile
                    label="Uptime"
                    value={fmtUptime(s.uptimeSeconds)}
                    hint={`since ${new Date(s.startedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                  />
                  <Tile
                    label="App memory"
                    value={`${s.memoryMb} MB`}
                    hint={`host ${fmtInt(s.hostMemoryMb.total - s.hostMemoryMb.free)} of ${fmtInt(s.hostMemoryMb.total)} MB used`}
                  />
                  <Tile
                    label="CPU now"
                    value={`${s.history.at(-1)?.cpuPct ?? 0}%`}
                    hint={`${s.cpus} cores · load ${s.history.at(-1)?.load1 ?? 0}`}
                  />
                  <Tile label="Database" value={fmtBytes(s.dbSizeBytes)} />
                  <Tile
                    label="Disk free"
                    value={s.disk ? fmtBytes(s.disk.freeBytes) : "—"}
                    hint={
                      s.disk ? `of ${fmtBytes(s.disk.totalBytes)}` : undefined
                    }
                  />
                  <Tile
                    label="Last backup"
                    value={s.lastBackupAt ? ago(s.lastBackupAt) : "none"}
                    hint={s.node}
                  />
                </>
              ) : (
                !error &&
                [0, 1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} height="5.4rem" />
                ))
              )}
            </section>
            <span style={muted}>
              History is sampled every minute and kept in memory for 24 hours;
              it starts again when the app restarts.
            </span>
            <div style={grid(320)}>
              <section style={card} aria-label="Memory history">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "1rem",
                    flexWrap: "wrap",
                  }}
                >
                  <h2 style={h2}>Memory (MB)</h2>
                  <Legend
                    items={[
                      { color: "var(--accent)", label: "Total" },
                      { color: "var(--success)", label: "JS heap" },
                    ]}
                  />
                </div>
                {s ? (
                  <LineChart
                    points={s.history}
                    series={[
                      { key: "rssMb", color: "var(--accent)" },
                      { key: "heapMb", color: "var(--success)" },
                    ]}
                    unit=" MB"
                  />
                ) : (
                  <Skeleton height="10rem" />
                )}
              </section>
              <section style={card} aria-label="CPU history">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "1rem",
                    flexWrap: "wrap",
                  }}
                >
                  <h2 style={h2}>CPU (%)</h2>
                  <Legend
                    items={[{ color: "var(--accent)", label: "App CPU" }]}
                  />
                </div>
                {s ? (
                  <LineChart
                    points={s.history}
                    series={[{ key: "cpuPct", color: "var(--accent)" }]}
                    unit="%"
                  />
                ) : (
                  <Skeleton height="10rem" />
                )}
              </section>
              <section style={card} aria-label="Load history">
                <h2 style={h2}>Host load (1 min)</h2>
                {s ? (
                  <LineChart
                    points={s.history}
                    series={[{ key: "load1", color: "var(--success)" }]}
                    unit=""
                  />
                ) : (
                  <Skeleton height="10rem" />
                )}
              </section>
              <section style={card} aria-label="Backups">
                <h2 style={h2}>Backups</h2>
                <span style={muted}>
                  Size of the last {s?.backups.length ?? 0} backups.
                </span>
                {s ? (
                  <BackupBars rows={s.backups} />
                ) : (
                  <Skeleton height="10rem" />
                )}
              </section>
            </div>
          </>
        )}

        {tab === "students" && (
          <>
            <section aria-label="Student activity" style={grid(160)}>
              {u ? (
                <>
                  <Tile
                    label="Students"
                    value={fmtInt(u.students)}
                    hint="all accounts"
                  />
                  <Tile label="Active today" value={fmtInt(u.activeToday)} />
                  <Tile label="Active 7 days" value={fmtInt(u.active7d)} />
                  <Tile label="Active 30 days" value={fmtInt(u.active30d)} />
                </>
              ) : (
                !error &&
                [0, 1, 2, 3].map((i) => <Skeleton key={i} height="5.4rem" />)
              )}
            </section>
            <section style={card} aria-label="Online now">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "1rem",
                }}
              >
                <h2 style={h2}>
                  Online now{data ? ` (${data.online.length})` : ""}
                </h2>
                <span style={muted}>Active in the last 5 minutes</span>
              </div>
              {data ? (
                <OnlineNow rows={data.online} onOpen={setProfile} />
              ) : (
                <Skeleton height="2.4rem" />
              )}
            </section>
            <section style={card} aria-label="Students">
              <h2 style={h2}>Students</h2>
              <span style={muted}>
                Submissions and mock exams per student, all time. Select a
                student to see their summary.
              </span>
              <Users onOpen={setProfile} />
            </section>
          </>
        )}
        <UserProfile username={profile} onClose={() => setProfile(null)} />
      </div>
    </main>
  );
}
