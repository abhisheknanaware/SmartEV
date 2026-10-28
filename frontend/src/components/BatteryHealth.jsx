import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { BatteryCharging, Trash2, Info, TrendingDown, TrendingUp } from 'lucide-react';
import { vehicleApi } from '../services/api';
import { Button, Badge } from './ui';

const EFF = { DC: 0.93, AC: 0.9 }; // must match BatteryHealthService
const today = () => new Date().toISOString().slice(0, 10);

/** Form to log one charge. Shows the capacity the readings imply before saving. */
export function LogChargeForm({ vehicle, bookingId, defaultType = 'DC', onSaved, onCancel }) {
  const [form, setForm] = useState({ sessionDate: today(), socStartPct: '', socEndPct: '', energyKwh: '', chargerType: defaultType });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const start = parseFloat(form.socStartPct), end = parseFloat(form.socEndPct), kwh = parseFloat(form.energyKwh);
  const span = end - start;
  const implied = span > 0 && kwh > 0 ? (kwh * EFF[form.chargerType]) / (span / 100) : null;
  const impliedSoh = implied && vehicle?.batteryCapacityKwh ? (implied / vehicle.batteryCapacityKwh) * 100 : null;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!(span >= 10)) return setError('Battery % after must be at least 10 points higher than before.');
    setBusy(true);
    try {
      const res = await vehicleApi.logSession(vehicle.id, { ...form, socStartPct: start, socEndPct: end, energyKwh: kwh, bookingId });
      onSaved?.(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'The charge could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full rounded-xl border border-slate-300 bg-white py-2.5 px-3 text-[15px] text-slate-900';
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-sm font-semibold text-slate-700 mb-1.5">Battery before (%)</span>
          <input type="number" inputMode="decimal" min="0" max="100" value={form.socStartPct} onChange={set('socStartPct')} placeholder="20" className={field} required />
        </label>
        <label className="block">
          <span className="block text-sm font-semibold text-slate-700 mb-1.5">Battery after (%)</span>
          <input type="number" inputMode="decimal" min="0" max="100" value={form.socEndPct} onChange={set('socEndPct')} placeholder="80" className={field} required />
        </label>
        <label className="block">
          <span className="block text-sm font-semibold text-slate-700 mb-1.5">Energy (kWh)</span>
          <input type="number" inputMode="decimal" min="0" step="0.1" value={form.energyKwh} onChange={set('energyKwh')} placeholder="From receipt" className={field} required />
        </label>
        <label className="block">
          <span className="block text-sm font-semibold text-slate-700 mb-1.5">Date</span>
          <input type="date" max={today()} value={form.sessionDate} onChange={set('sessionDate')} className={field} />
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold text-slate-700 mb-1.5">Charger</legend>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100">
          {[['DC', 'Fast DC'], ['AC', 'AC / home']].map(([v, label]) => (
            <button key={v} type="button" onClick={() => setForm((f) => ({ ...f, chargerType: v }))} aria-pressed={form.chargerType === v}
              className={`py-2 rounded-lg text-sm font-semibold ${form.chargerType === v ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'}`}>{label}</button>
          ))}
        </div>
      </fieldset>

      {impliedSoh != null && (
        <p className={`text-sm rounded-xl px-3 py-2 ${impliedSoh < 40 || impliedSoh > 115 ? 'bg-amber-50 text-amber-800' : 'bg-brand-50 text-brand-900'}`}>
          These readings imply about <strong>{implied.toFixed(1)} kWh</strong> usable, <strong>{impliedSoh.toFixed(0)}%</strong> of the rated {vehicle.batteryCapacityKwh} kWh.
          {span < 30 && ' Charges over 30 points give more reliable readings.'}
        </p>
      )}
      <p className="text-xs text-slate-500 flex gap-1.5"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Use the kWh from the charger screen or receipt, and the % your car showed before and after.</p>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" variant="primary" loading={busy}>Save charge</Button>
      </div>
    </form>
  );
}

/** Health estimate, trend chart and charge history for one vehicle. */
export function BatteryHealthPanel({ vehicle, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = () => vehicleApi.getHealth(vehicle.id).then((r) => setData(r.data)).catch((e) => setError(e.response?.data?.message || 'Could not load battery health.'));
  useEffect(() => { load(); }, [vehicle.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updated = (d) => { setData(d); setAdding(false); onChanged?.(d); };
  const remove = async (id) => {
    try { updated((await vehicleApi.deleteSession(vehicle.id, id)).data); } catch (e) { setError(e.response?.data?.message || 'Could not remove that charge.'); }
  };

  const chart = useMemo(() => (data?.sessions || []).map((s) => ({ date: s.sessionDate, soh: s.sohPct, window: s.windowPct })), [data]);
  if (error) return <p role="alert" className="text-sm text-rose-700">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;
  const est = data.estimate;

  return (
    <div className="space-y-5">
      {est ? (
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-brand-50 p-4">
            <div className="text-xs font-medium text-brand-800">Estimated health</div>
            <div className="text-3xl font-extrabold font-display tabular-nums text-slate-900">{est.sohPct.toFixed(1)}%</div>
            <div className="text-xs text-slate-600">middle half of readings {est.rangePct[0]}–{est.rangePct[1]}%</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs font-medium text-slate-500">Usable capacity</div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">{est.capacityKwh} <span className="text-base font-semibold text-slate-500">/ {data.nominalCapacityKwh} kWh</span></div>
            {est.trendPerYearPct != null && (
              <div className={`text-xs mt-1 flex items-center gap-1 ${est.trendPerYearPct < 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {est.trendPerYearPct < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                {est.trendPerYearPct > 0 ? '+' : ''}{est.trendPerYearPct} pts per year
              </div>
            )}
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs font-medium text-slate-500">Confidence</div>
            <div className="mt-1"><Badge tone={est.confidence === 'high' ? 'green' : est.confidence === 'medium' ? 'sky' : 'amber'} dot>{est.confidence}</Badge></div>
            <div className="text-xs text-slate-600 mt-1.5">from {est.sessionsUsed} recent charge{est.sessionsUsed > 1 ? 's' : ''}</div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600 flex gap-3">
          <BatteryCharging className="w-5 h-5 text-brand-600 shrink-0" />
          <span>Log a charge to see your battery’s real health. After 2–3 charges of 30%+ each, the estimate becomes reliable.</span>
        </div>
      )}

      {chart.length > 1 && (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis domain={[(m) => Math.max(40, Math.floor(m - 5)), (m) => Math.min(115, Math.ceil(m + 3))]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
              <Tooltip formatter={(v, n, p) => [`${v}% (from a ${p.payload.window}-point charge)`, 'Health']} />
              {est && <ReferenceLine y={est.sohPct} stroke="#06bfab" strokeDasharray="4 4" />}
              <Line type="monotone" dataKey="soh" stroke="#009a8c" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {adding ? (
        <div className="rounded-2xl ring-1 ring-slate-200 p-4"><LogChargeForm vehicle={vehicle} onSaved={updated} onCancel={() => setAdding(false)} /></div>
      ) : (
        <Button variant="solid" icon={BatteryCharging} onClick={() => setAdding(true)}>Log a charge</Button>
      )}

      {data.sessions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Logged charges</h3>
          <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
            {[...data.sessions].reverse().map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="text-slate-700 tabular-nums">
                  {s.sessionDate} · {s.socStartPct}→{s.socEndPct}% · {s.energyKwh} kWh {s.chargerType}{s.bookingId ? ' · booking' : ''}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-slate-900">{s.sohPct}%</span>
                  <button onClick={() => remove(s.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50" aria-label={`Remove charge from ${s.sessionDate}`}><Trash2 className="w-4 h-4" /></button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-slate-500">{data.method}</p>
    </div>
  );
}
