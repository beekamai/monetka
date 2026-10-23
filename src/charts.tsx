import { monthTitle, rub } from './model.ts';
import type { TrendPoint } from './calc.ts';

export interface Slice { label: string; value: number; color: string }

export function Donut({ slices, total, caption }: { slices: Slice[]; total: number; caption: string }) {
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  const sum = slices.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <svg viewBox="0 0 140 140" class="donut" role="img" aria-label={caption}>
      <circle cx="70" cy="70" r={R} fill="none" stroke="var(--track)" stroke-width="16" />
      {slices.map((s, i) => {
        const len = (s.value / sum) * C;
        const gap = slices.length > 1 ? Math.min(2, len / 3) : 0;
        const el = (
          <circle class="donut-seg" style={{ animationDelay: `${i * 60}ms` }} cx="70" cy="70" r={R} fill="none" stroke={s.color} stroke-width="16"
            stroke-dasharray={`${Math.max(len - gap, 0)} ${C}`} stroke-dashoffset={-acc}
            transform="rotate(-90 70 70)" />
        );
        acc += len;
        return el;
      })}
      <text x="70" y="66" text-anchor="middle" class="donut-val">{rub(total)}</text>
      <text x="70" y="84" text-anchor="middle" class="donut-cap">{caption}</text>
    </svg>
  );
}

type Day = { day: number; expense: number; income: number };

export function DayBars({ data, today, kind }: { data: Day[]; today?: number; kind: 'expense' | 'income' }) {
  const val = (d: Day) => d[kind];
  const max = Math.max(1, ...data.map(val));
  const W = 320, H = 110, bw = W / data.length;
  const peak = data.reduce((a, d) => (val(d) > val(a) ? d : a), data[0]);
  const hi = kind === 'income' ? 'var(--pos)' : 'var(--accent)';
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} class="bars" role="img" aria-label={kind === 'income' ? 'Доходы по дням' : 'Траты по дням'}>
      {data.map((d, i) => {
        const h = val(d) > 0 ? Math.max(3, (val(d) / max) * H) : 0;
        return (
          <g key={`${kind}-${d.day}`}>
            {h === 0 && <rect x={i * bw + bw * 0.2} y={H - 2} width={bw * 0.6} height={2} rx={1} fill="var(--track)" />}
            {h > 0 && (
              <rect class="bar" style={{ animationDelay: `${i * 12}ms` }} x={i * bw + bw * 0.15} y={H - h} width={bw * 0.7} height={h}
                rx={Math.min(3, bw * 0.3)} fill={d.day === peak.day ? hi : kind === 'income' ? 'var(--bar-pos)' : 'var(--bar)'}>
                <title>{`${d.day}: ${rub(val(d))}`}</title>
              </rect>
            )}
            {(d.day === 1 || d.day % 5 === 0 || d.day === today) && (
              <text x={i * bw + bw / 2} y={H + 14} text-anchor="middle"
                class={d.day === today ? 'bars-lbl today' : 'bars-lbl'}>{d.day}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

const shortMonth = (key: string) => monthTitle(key).slice(0, 3);

/** Доходы и расходы по месяцам столбцами, остаток на конец месяца — линией */
export function TrendChart({ points, current }: { points: TrendPoint[]; current: string }) {
  const W = 320, H = 120, top = 8, n = points.length, slot = W / n, bw = Math.min(14, slot * 0.26);
  const maxBar = Math.max(1, ...points.flatMap((p) => [p.income, p.spent + p.saved]));
  const ends = points.map((p) => p.end);
  const lo = Math.min(0, ...ends), hi = Math.max(1, ...ends);
  const y = (v: number) => top + (H - top) * (1 - (v - lo) / (hi - lo || 1));
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${(i + 0.5) * slot},${y(p.end)}`).join(' ');
  const bar = (v: number) => (v > 0 ? Math.max(2, (v / maxBar) * (H - top)) : 0);
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} class="bars trend" role="img" aria-label="Динамика по месяцам">
      {points.map((p, i) => {
        const cx = (i + 0.5) * slot, hi1 = bar(p.income), ex = bar(p.spent + p.saved);
        return (
          <g key={p.key}>
            <rect class="bar" style={{ animationDelay: `${i * 50}ms` }} x={cx - bw - 1.5} y={H - hi1} width={bw} height={hi1} rx={3} fill="var(--pos)" opacity={0.85}>
              <title>{`${monthTitle(p.key)}: доходы ${rub(p.income)}`}</title>
            </rect>
            <rect class="bar" style={{ animationDelay: `${i * 50 + 25}ms` }} x={cx + 1.5} y={H - ex} width={bw} height={ex} rx={3} fill="var(--bar)">
              <title>{`${monthTitle(p.key)}: расходы ${rub(p.spent + p.saved)}`}</title>
            </rect>
            <text x={cx} y={H + 14} text-anchor="middle" class={p.key === current ? 'bars-lbl today' : 'bars-lbl'}>{shortMonth(p.key)}</text>
          </g>
        );
      })}
      <path class="trend-line" d={line} fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" pathLength={1} />
      {points.map((p, i) => (
        <circle cx={(i + 0.5) * slot} cy={y(p.end)} r={p.key === current ? 4 : 2.6} fill="var(--card)" stroke="var(--accent)" stroke-width="2">
          <title>{`${monthTitle(p.key)}: остаток ${rub(p.end)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function Progress({ value, max, over, goal }: { value: number; max: number; over?: boolean; goal?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : value > 0 ? 100 : 0;
  return (
    <div class="progress"><div class={over ? 'fill over' : goal ? 'fill goal' : 'fill'} style={{ width: `${pct}%` }} /></div>
  );
}
