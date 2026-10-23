import { rub } from './model.ts';

export interface Slice { label: string; value: number; color: string }

export function Donut({ slices, total, caption }: { slices: Slice[]; total: number; caption: string }) {
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  const sum = slices.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <svg viewBox="0 0 140 140" class="donut" role="img" aria-label={caption}>
      <circle cx="70" cy="70" r={R} fill="none" stroke="var(--track)" stroke-width="16" />
      {slices.map((s) => {
        const len = (s.value / sum) * C;
        const gap = slices.length > 1 ? Math.min(2, len / 3) : 0;
        const el = (
          <circle cx="70" cy="70" r={R} fill="none" stroke={s.color} stroke-width="16"
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

export function DayBars({ data, today }: { data: { day: number; expense: number; income: number }[]; today?: number }) {
  const max = Math.max(1, ...data.map((d) => d.expense));
  const W = 320, H = 110, bw = W / data.length;
  const peak = data.reduce((a, d) => (d.expense > a.expense ? d : a), data[0]);
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} class="bars" role="img" aria-label="Траты по дням">
      {data.map((d, i) => {
        const h = d.expense > 0 ? Math.max(3, (d.expense / max) * H) : 0;
        return (
          <g key={d.day}>
            {h === 0 && <rect x={i * bw + bw * 0.2} y={H - 2} width={bw * 0.6} height={2} rx={1} fill="var(--track)" />}
            {h > 0 && (
              <rect x={i * bw + bw * 0.15} y={H - h} width={bw * 0.7} height={h} rx={Math.min(3, bw * 0.3)}
                fill={d.day === peak.day ? 'var(--accent)' : 'var(--bar)'}>
                <title>{`${d.day}: ${rub(d.expense)}`}</title>
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

export function Progress({ value, max, over }: { value: number; max: number; over?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : value > 0 ? 100 : 0;
  return (
    <div class="progress"><div class={over ? 'fill over' : 'fill'} style={{ width: `${pct}%` }} /></div>
  );
}
