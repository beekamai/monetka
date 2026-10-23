import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Category, Kind, State, Tx } from './model.ts';
import { PALETTE, monthKey, monthTitle, rub, shiftMonth, signedRub, todayISO, uid } from './model.ts';
import { planFor, summarize } from './calc.ts';
import { load, pickFile, save, saveFile } from './storage.ts';
import { exportMonth, importWorkbook, parseAmount } from './xlsxio.ts';
import { DayBars, Donut, Progress } from './charts.tsx';

type Tab = 'overview' | 'ops' | 'plan' | 'more';

export function App() {
  const [s, setS] = useState<State | null>(null);
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState<Tx | 'new-expense' | 'new-income' | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => { load().then(setS); }, []);
  useEffect(() => { if (s) save(s); }, [s]);
  useEffect(() => {
    if (!s) return;
    const dark = s.theme === 'dark' || (s.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [s?.theme]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t); } }, [toast]);

  const m = useMemo(() => (s ? summarize(s, month) : null), [s, month]);
  if (!s || !m) return <div class="splash" />;

  const update = (fn: (d: State) => void) => setS((prev) => { const d = structuredClone(prev!); fn(d); return d; });

  return (
    <div class="app">
      <header class="top">
        <button class="icon-btn" aria-label="Предыдущий месяц" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <button class="month" onClick={() => setMonth(monthKey(todayISO()))}>{monthTitle(month)}</button>
        <button class="icon-btn" aria-label="Следующий месяц" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </header>

      <main class="content">
        {tab === 'overview' && <Overview s={s} m={m} month={month} />}
        {tab === 'ops' && <Ops s={s} m={m} onEdit={setEditing} />}
        {tab === 'plan' && <Plan s={s} m={m} month={month} update={update} />}
        {tab === 'more' && <More s={s} m={m} month={month} update={update} setS={setS} toast={setToast} />}
      </main>

      {(tab === 'overview' || tab === 'ops') && (
        <div class="fabs">
          <button class="fab ghost" onClick={() => setEditing('new-income')}>+ Доход</button>
          <button class="fab" onClick={() => setEditing('new-expense')}>+ Расход</button>
        </div>
      )}

      <nav class="tabs">
        {([['overview', 'Обзор', 'M4 13h4v7H4zM10 8h4v12h-4zM16 4h4v16h-4z'], ['ops', 'Операции', 'M4 6h16M4 12h16M4 18h10'], ['plan', 'План', 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z'], ['more', 'Ещё', 'M5 12h.01M12 12h.01M19 12h.01']] as const).map(([k, l, d]) => (
          <button class={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)}>
            <svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={d} /></svg>{l}</button>
        ))}
      </nav>

      {editing && (
        <TxSheet s={s} month={month} value={editing} onClose={() => setEditing(null)}
          onSave={(tx) => { update((d) => { const i = d.txs.findIndex((t) => t.id === tx.id); if (i >= 0) d.txs[i] = tx; else d.txs.push(tx); }); setEditing(null); }}
          onDelete={(id) => { update((d) => { d.txs = d.txs.filter((t) => t.id !== id); }); setEditing(null); }} />
      )}
      {toast && <div class="toast">{toast}</div>}
    </div>
  );
}

type M = ReturnType<typeof summarize>;

function Overview({ s, m, month }: { s: State; m: M; month: string }) {
  const slices = m.expenseRows.filter((r) => r.fact > 0 && !r.cat.savings).sort((a, b) => b.fact - a.fact)
    .map((r) => ({ label: r.cat.name, value: r.fact, color: r.cat.color }));
  const today = monthKey(todayISO()) === month ? new Date().getDate() : undefined;
  const pct = m.deltaPct == null ? '' : `${m.deltaPct >= 0 ? '+' : '−'}${Math.abs(Math.round(m.deltaPct * 100)).toLocaleString('ru-RU')}%`;
  const overPlan = m.spentPlan > 0 && m.spent > m.spentPlan;

  return (
    <>
      <section class="card hero">
        <div class="hero-lbl">Остаток на конец периода</div>
        <div class="hero-val">{rub(m.end)}</div>
        <div class="hero-row">
          <span class="muted">Начальная {rub(m.start)}{m.startIsAuto && m.start !== 0 ? ' · из прошлого месяца' : ''}</span>
          <span class={m.delta >= 0 ? 'chip pos' : 'chip neg'}>{signedRub(m.delta)}{pct && ` · ${pct}`}</span>
        </div>
      </section>

      <section class="grid2">
        <Stat label="Доходы" value={m.income} sub={m.incomePlan ? `план ${rub(m.incomePlan)}` : m.tips ? `чаевые ${rub(m.tips)}` : ''} tone="pos" />
        <Stat label="Расходы" value={m.spent} sub={m.spentPlan ? `план ${rub(m.spentPlan)}` : 'без копилки'} tone={overPlan ? 'neg' : undefined} />
        <Stat label="Отложено" value={m.saved} sub={`в общем ${rub(m.stash)}`} />
        <Stat label="Всего списано" value={m.expenseTotal} sub="с копилкой" />
      </section>

      <section class="card">
        <h2>Куда ушли деньги</h2>
        {slices.length === 0 ? <Empty text="Трат в этом месяце пока нет" /> : (
          <div class="donut-wrap">
            <Donut slices={slices} total={m.spent} caption="потрачено" />
            <ul class="legend">
              {slices.slice(0, 7).map((x) => (
                <li><i style={{ background: x.color }} /><span>{x.label}</span><b>{Math.round((x.value / m.spent) * 100)}%</b></li>
              ))}
              {slices.length > 7 && <li class="muted">ещё {slices.length - 7}</li>}
            </ul>
          </div>
        )}
      </section>

      <section class="card">
        <h2>Траты по дням</h2>
        {m.spent === 0 ? <Empty text="Здесь появится график" /> : <DayBars data={m.byDay} today={today} />}
      </section>

      <section class="card">
        <h2>Последние операции</h2>
        {m.txs.length === 0 ? <Empty text="Добавь первую операцию кнопкой внизу" /> :
          m.txs.slice(0, 5).map((t) => <TxRow s={s} t={t} />)}
      </section>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div class="card stat">
      <div class="stat-lbl">{label}</div>
      <div class={`stat-val ${tone ?? ''}`}>{rub(value)}</div>
      {sub && <div class="stat-sub">{sub}</div>}
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <div class="empty">{text}</div>;

function TxRow({ s, t, onClick }: { s: State; t: Tx; onClick?: () => void }) {
  const cat = s.categories.find((c) => c.id === t.categoryId);
  return (
    <button class="tx" onClick={onClick} disabled={!onClick}>
      <i class="dot" style={{ background: cat?.color ?? 'var(--muted)' }} />
      <span class="tx-main">
        <span class="tx-cat">{cat?.name ?? 'Без категории'}</span>
        {t.desc && <span class="tx-desc">{t.desc}</span>}
      </span>
      <span class={t.kind === 'income' ? 'tx-amt pos' : 'tx-amt'}>{t.kind === 'income' ? '+' : '−'}{rub(t.amount)}</span>
    </button>
  );
}

function Ops({ s, m, onEdit }: { s: State; m: M; onEdit: (t: Tx) => void }) {
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const [q, setQ] = useState('');
  const list = m.txs.filter((t) => (filter === 'all' || t.kind === filter) &&
    (!q || t.desc.toLowerCase().includes(q.toLowerCase()) ||
      (s.categories.find((c) => c.id === t.categoryId)?.name.toLowerCase().includes(q.toLowerCase()) ?? false)));
  const groups = new Map<string, Tx[]>();
  for (const t of list) groups.set(t.date, [...(groups.get(t.date) ?? []), t]);
  const fmt = (d: string) => new Date(d + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });

  return (
    <>
      <div class="seg">
        {([['all', 'Все'], ['expense', 'Расходы'], ['income', 'Доходы']] as const).map(([k, l]) => (
          <button class={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      <input class="search" placeholder="Поиск по описанию или категории" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      {list.length === 0 && <Empty text="Операций нет" />}
      {[...groups].map(([date, txs]) => {
        const dayTotal = txs.reduce((a, t) => a + (t.kind === 'income' ? t.amount : -t.amount), 0);
        return (
          <section class="card day">
            <div class="day-head"><span>{fmt(date)}</span><span class={dayTotal >= 0 ? 'pos' : 'muted'}>{signedRub(dayTotal)}</span></div>
            {txs.map((t) => <TxRow s={s} t={t} onClick={() => onEdit(t)} />)}
          </section>
        );
      })}
    </>
  );
}

function Plan({ s, m, month, update }: { s: State; m: M; month: string; update: (fn: (d: State) => void) => void }) {
  const [kind, setKind] = useState<Kind>('expense');
  const rows = kind === 'expense' ? m.expenseRows : m.incomeRows;
  const plan = rows.reduce((a, r) => a + r.plan, 0);
  const fact = rows.reduce((a, r) => a + r.fact, 0);
  const diff = kind === 'expense' ? plan - fact : fact - plan;
  const sorted = [...rows].sort((a, b) => (b.fact + b.plan) - (a.fact + a.plan));

  const setPlan = (cat: Category, raw: string) => {
    const v = parseAmount(raw) ?? 0;
    update((d) => { const mm = (d.months[month] ??= {}); (mm.plans ??= {})[cat.id] = v; });
  };

  return (
    <>
      <div class="seg">
        <button class={kind === 'expense' ? 'on' : ''} onClick={() => setKind('expense')}>Расходы</button>
        <button class={kind === 'income' ? 'on' : ''} onClick={() => setKind('income')}>Доходы</button>
      </div>
      <section class="card totals">
        <div><span class="stat-lbl">План</span><b>{rub(plan)}</b></div>
        <div><span class="stat-lbl">Факт</span><b>{rub(fact)}</b></div>
        <div><span class="stat-lbl">Разница</span><b class={diff >= 0 ? 'pos' : 'neg'}>{signedRub(diff)}</b></div>
      </section>
      <p class="hint">Нажми на сумму плана, чтобы изменить её для {monthTitle(month).toLowerCase()}.</p>
      <section class="card">
        {sorted.map((r) => {
          const over = kind === 'expense' && r.fact > r.plan;
          return (
            <div class="plan-row">
              <div class="plan-top">
                <span class="plan-name"><i class="dot" style={{ background: r.cat.color }} />{r.cat.name}{r.cat.savings && <em class="tag">копилка</em>}</span>
                <span class={r.diff > 0 ? 'pos' : r.diff < 0 ? (kind === 'expense' ? 'neg' : 'muted') : 'muted'}>{r.diff === 0 ? '—' : signedRub(r.diff)}</span>
              </div>
              <Progress value={r.fact} max={r.plan} over={over} />
              <div class="plan-bottom">
                <span>{rub(r.fact)}</span>
                <label class="plan-input">план
                  <input inputMode="decimal" value={r.plan ? String(r.plan) : ''} placeholder="0"
                    onChange={(e) => setPlan(r.cat, e.currentTarget.value)} />
                  ₽
                </label>
              </div>
            </div>
          );
        })}
      </section>
      {s.months[month]?.plans && (
        <button class="link" onClick={() => update((d) => { if (d.months[month]) delete d.months[month].plans; })}>
          Сбросить планы месяца к значениям по умолчанию
        </button>
      )}
    </>
  );
}

function More({ s, m, month, update, setS, toast }: {
  s: State; m: M; month: string; update: (fn: (d: State) => void) => void; setS: (s: State) => void; toast: (t: string) => void;
}) {
  const [editCat, setEditCat] = useState<Category | 'new-expense' | 'new-income' | null>(null);
  const [startRaw, setStartRaw] = useState(s.months[month]?.start?.toString() ?? '');
  useEffect(() => setStartRaw(s.months[month]?.start?.toString() ?? ''), [month]);

  const doImport = async () => {
    const f = await pickFile('.xlsx,.xls,.ods,.csv');
    if (!f) return;
    try {
      const r = importWorkbook(new Uint8Array(await f.arrayBuffer()), s);
      setS(r.state);
      toast(`Импорт: +${r.added} операций${r.skipped ? `, ${r.skipped} уже были` : ''}${r.newCategories.length ? `, новых категорий ${r.newCategories.length}` : ''}`);
    } catch { toast('Не удалось прочитать файл'); }
  };
  const doExport = async () => {
    try { await saveFile(`Финансовый учёт ${monthTitle(month)}.xlsx`, exportMonth(s, month), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); }
    catch { toast('Экспорт не удался'); }
  };
  const doBackup = () => saveFile(`budget-backup-${todayISO()}.json`, JSON.stringify(s), 'application/json').catch(() => toast('Не удалось сохранить'));
  const doRestore = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const d = JSON.parse(await f.text()) as State;
      if (d.version !== 1 || !Array.isArray(d.txs)) throw 0;
      if (confirm(`Заменить текущие данные копией (${d.txs.length} операций)?`)) { setS(d); toast('Данные восстановлены'); }
    } catch { toast('Это не файл резервной копии'); }
  };

  return (
    <>
      <section class="card">
        <h2>Начальная сумма — {monthTitle(month)}</h2>
        <div class="row-input">
          <input inputMode="decimal" placeholder={`${Math.round(m.start)} (авто)`} value={startRaw}
            onInput={(e) => setStartRaw(e.currentTarget.value)}
            onChange={(e) => {
              const v = parseAmount(e.currentTarget.value);
              update((d) => { const mm = (d.months[month] ??= {}); if (v == null) delete mm.start; else mm.start = v; });
            }} />
          <span>₽</span>
        </div>
        <p class="hint">Пусто — подставится остаток прошлого месяца.</p>
      </section>

      <section class="card">
        <h2>Категории</h2>
        {(['expense', 'income'] as const).map((k) => (
          <div class="cat-group">
            <div class="cat-head"><span class="stat-lbl">{k === 'expense' ? 'Расходы' : 'Доходы'}</span>
              <button class="link" onClick={() => setEditCat(k === 'expense' ? 'new-expense' : 'new-income')}>+ Добавить</button></div>
            {s.categories.filter((c) => c.kind === k).map((c) => (
              <button class="cat" onClick={() => setEditCat(c)}>
                <i class="dot" style={{ background: c.color }} /><span>{c.name}</span>
                {c.savings && <em class="tag">копилка</em>}{c.tips && <em class="tag">чаевые</em>}
                <span class="muted">{c.plan ? rub(c.plan) : ''}</span>
              </button>
            ))}
          </div>
        ))}
      </section>

      <section class="card actions">
        <h2>Данные</h2>
        <button class="btn" onClick={doExport}>Экспорт месяца в Excel</button>
        <button class="btn" onClick={doImport}>Импорт из таблицы (.xlsx)</button>
        <button class="btn ghost" onClick={doBackup}>Резервная копия</button>
        <button class="btn ghost" onClick={doRestore}>Восстановить из копии</button>
        <p class="hint">Импорт понимает шаблон Google Таблиц «Месячный бюджет»: листы «Сводка» и «Транзакции». Повторный импорт не дублирует операции.</p>
      </section>

      <section class="card">
        <h2>Тема</h2>
        <div class="seg">
          {([['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']] as const).map(([k, l]) => (
            <button class={s.theme === k ? 'on' : ''} onClick={() => update((d) => { d.theme = k; })}>{l}</button>
          ))}
        </div>
      </section>

      {editCat && (
        <CatSheet s={s} month={month} value={editCat} onClose={() => setEditCat(null)}
          onSave={(c) => { update((d) => { const i = d.categories.findIndex((x) => x.id === c.id); if (i >= 0) d.categories[i] = c; else d.categories.push(c); }); setEditCat(null); }}
          onDelete={(id, moveTo) => {
            update((d) => {
              d.categories = d.categories.filter((c) => c.id !== id);
              d.txs = moveTo ? d.txs.map((t) => (t.categoryId === id ? { ...t, categoryId: moveTo } : t)) : d.txs.filter((t) => t.categoryId !== id);
            });
            setEditCat(null);
          }} />
      )}
    </>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: preact.ComponentChildren }) {
  return (
    <div class="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet" role="dialog" aria-label={title}>
        <div class="grab" />
        <div class="sheet-head"><h3>{title}</h3><button class="icon-btn" aria-label="Закрыть" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

function TxSheet({ s, month, value, onClose, onSave, onDelete }: {
  s: State; month: string; value: Tx | 'new-expense' | 'new-income';
  onClose: () => void; onSave: (t: Tx) => void; onDelete: (id: string) => void;
}) {
  const isNew = typeof value === 'string';
  const defDate = monthKey(todayISO()) === month ? todayISO() : `${month}-01`;
  const [kind, setKind] = useState<Kind>(isNew ? (value === 'new-income' ? 'income' : 'expense') : value.kind);
  const [amount, setAmount] = useState(isNew ? '' : String(value.amount));
  const [date, setDate] = useState(isNew ? defDate : value.date);
  const [desc, setDesc] = useState(isNew ? '' : value.desc);
  const cats = s.categories.filter((c) => c.kind === kind);
  const [catId, setCatId] = useState(isNew ? '' : value.categoryId);
  const validCat = cats.some((c) => c.id === catId) ? catId : '';
  const amt = parseAmount(amount);
  const ok = amt != null && amt > 0 && validCat && date;

  return (
    <Sheet title={isNew ? 'Новая операция' : 'Операция'} onClose={onClose}>
      <div class="seg">
        <button class={kind === 'expense' ? 'on' : ''} onClick={() => setKind('expense')}>Расход</button>
        <button class={kind === 'income' ? 'on' : ''} onClick={() => setKind('income')}>Доход</button>
      </div>
      <div class="amount-field">
        <input autoFocus inputMode="decimal" placeholder="0" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} />
        <span>₽</span>
      </div>
      <div class="chips">
        {cats.map((c) => (
          <button class={validCat === c.id ? 'chipsel on' : 'chipsel'} style={validCat === c.id ? { borderColor: c.color, background: c.color + '22' } : {}}
            onClick={() => setCatId(c.id)}><i class="dot" style={{ background: c.color }} />{c.name}</button>
        ))}
      </div>
      <label class="field"><span>Описание</span>
        <input placeholder="Например: продукты, такси" value={desc} onInput={(e) => setDesc(e.currentTarget.value)} /></label>
      <label class="field"><span>Дата</span>
        <input type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} /></label>
      <div class="sheet-actions">
        {!isNew && <button class="btn danger" onClick={() => { if (confirm('Удалить операцию?')) onDelete(value.id); }}>Удалить</button>}
        <button class="btn primary" disabled={!ok}
          onClick={() => onSave({ id: isNew ? uid() : value.id, kind, amount: amt!, date, desc: desc.trim(), categoryId: validCat })}>
          Сохранить
        </button>
      </div>
    </Sheet>
  );
}

function CatSheet({ s, month, value, onClose, onSave, onDelete }: {
  s: State; month: string; value: Category | 'new-expense' | 'new-income';
  onClose: () => void; onSave: (c: Category) => void; onDelete: (id: string, moveTo: string | null) => void;
}) {
  const isNew = typeof value === 'string';
  const base: Category = isNew
    ? { id: uid(), name: '', kind: value === 'new-income' ? 'income' : 'expense', plan: 0, color: PALETTE[s.categories.length % PALETTE.length] }
    : value;
  const [c, setC] = useState<Category>(base);
  const [planRaw, setPlanRaw] = useState(base.plan ? String(base.plan) : '');
  const used = !isNew && s.txs.filter((t) => t.categoryId === base.id).length;
  const others = s.categories.filter((x) => x.kind === c.kind && x.id !== c.id);
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? '');
  const monthPlan = !isNew ? planFor(s, month, base) : 0;

  return (
    <Sheet title={isNew ? 'Новая категория' : 'Категория'} onClose={onClose}>
      <label class="field"><span>Название</span>
        <input value={c.name} onInput={(e) => setC({ ...c, name: e.currentTarget.value })} placeholder="Например: Техника" /></label>
      <label class="field"><span>План по умолчанию на месяц, ₽</span>
        <input inputMode="decimal" value={planRaw} placeholder="0" onInput={(e) => setPlanRaw(e.currentTarget.value)} /></label>
      {!isNew && monthPlan !== base.plan && <p class="hint">В этом месяце задан свой план: {rub(monthPlan)}.</p>}
      <div class="swatches">
        {PALETTE.map((p) => <button class={c.color === p ? 'sw on' : 'sw'} style={{ background: p }} aria-label={p} onClick={() => setC({ ...c, color: p })} />)}
      </div>
      {c.kind === 'expense' && (
        <label class="check"><input type="checkbox" checked={!!c.savings} onChange={(e) => setC({ ...c, savings: e.currentTarget.checked })} />
          Копилка — деньги откладываются, а не тратятся</label>
      )}
      {c.kind === 'income' && (
        <label class="check"><input type="checkbox" checked={!!c.tips} onChange={(e) => setC({ ...c, tips: e.currentTarget.checked })} />
          Чаевые — учитывать отдельно</label>
      )}
      {!isNew && used ? (
        <div class="move">
          <span class="hint">В категории {used} операций. При удалении перенести их в:</span>
          <select value={moveTo} onChange={(e) => setMoveTo(e.currentTarget.value)}>
            {others.map((o) => <option value={o.id}>{o.name}</option>)}
          </select>
        </div>
      ) : null}
      <div class="sheet-actions">
        {!isNew && <button class="btn danger" disabled={!!used && !moveTo}
          onClick={() => { if (confirm(`Удалить категорию «${base.name}»?`)) onDelete(base.id, used ? moveTo : null); }}>Удалить</button>}
        <button class="btn primary" disabled={!c.name.trim()}
          onClick={() => onSave({ ...c, name: c.name.trim(), plan: parseAmount(planRaw) ?? 0 })}>Сохранить</button>
      </div>
    </Sheet>
  );
}
