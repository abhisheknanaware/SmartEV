import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, BatteryCharging, Zap, Plus, Trash2, Pencil, RefreshCw, Gauge, Plug, CalendarDays, XCircle } from 'lucide-react';
import { vehicleApi } from '../services/api';
import { PageShell, PageHeader, Card, Button, EmptyState, Skeleton, Modal, Badge } from '../components/ui';
import { BatteryHealthPanel } from '../components/BatteryHealth';

const POPULAR = ['Tata Nexon EV', 'Tata Punch EV', 'MG ZS EV', 'Mahindra XUV400', 'Hyundai Ioniq 5', 'BYD Atto 3'];
const CONNECTORS = ['CCS2', 'Type 2', 'CHAdeMO', 'Bharat DC-001'];
const CHEMISTRIES = [['LFP', 'LFP (most Tata, BYD)'], ['NMC', 'NMC (most MG, Hyundai, Kia)'], ['NCA', 'NCA'], ['LCO', 'LCO']];
const KM_PER_KWH = 6.5; // typical Indian compact EV efficiency, for a rough range estimate

const EMPTY_FORM = { model: '', licensePlate: '', batteryCapacityKwh: '', currentSocPercent: '80', maxChargingPowerKw: '50', connectorType: 'CCS2', chemistry: 'LFP', year: String(new Date().getFullYear()) };

const socTone = (soc) => (soc >= 60 ? 'from-emerald-400 to-brand-400' : soc >= 25 ? 'from-amber-300 to-amber-500' : 'from-rose-400 to-rose-600');

const VehiclesPage = () => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | vehicle
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [healthFor, setHealthFor] = useState(null);

  const fetchVehicles = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await vehicleApi.getAll();
      setVehicles(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'We couldn’t load your vehicles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicles();
  }, []);

  const openNew = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditing('new');
  };

  const openEdit = (v) => {
    setForm({
      model: v.model || '',
      licensePlate: v.licensePlate || v.vehicleNumber || '',
      batteryCapacityKwh: String(v.batteryCapacityKwh ?? ''),
      currentSocPercent: String(v.currentSocPercent ?? v.currentBatteryPct ?? ''),
      maxChargingPowerKw: String(v.maxChargingPowerKw ?? ''),
      connectorType: v.connectorType || 'CCS2',
      chemistry: v.chemistry || 'LFP',
      year: String(v.year ?? v.manufacturingYear ?? ''),
    });
    setFormError(null);
    setEditing(v);
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    const capacity = parseFloat(form.batteryCapacityKwh);
    const soc = parseFloat(form.currentSocPercent);
    if (!form.model.trim() || !form.licensePlate.trim()) return setFormError('Model and registration number are required.');
    if (!(capacity > 0 && capacity < 250)) return setFormError('Battery capacity should be between 1 and 250 kWh.');
    if (!(soc >= 0 && soc <= 100)) return setFormError('State of charge must be between 0 and 100%.');
    const payload = {
      model: form.model.trim(),
      licensePlate: form.licensePlate.trim().toUpperCase(),
      batteryCapacityKwh: capacity,
      currentSocPercent: soc,
      maxChargingPowerKw: form.maxChargingPowerKw ? parseFloat(form.maxChargingPowerKw) : null,
      connectorType: form.connectorType,
      chemistry: form.chemistry,
      year: form.year ? parseInt(form.year, 10) : null,
    };
    setSaving(true);
    setFormError(null);
    try {
      if (editing === 'new') await vehicleApi.add(payload);
      else await vehicleApi.update(editing.id, payload);
      setEditing(null);
      fetchVehicles();
    } catch (err) {
      setFormError(err.response?.data?.message || 'The vehicle could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setSaving(true);
    setFormError(null);
    try {
      await vehicleApi.delete(deleting.id);
      setDeleting(null);
      fetchVehicles();
    } catch (err) {
      setFormError(err.response?.data?.message || 'The vehicle could not be removed. It may be linked to bookings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        icon={Car}
        eyebrow="Your garage"
        title="My vehicles"
        subtitle="Battery size and connector decide which chargers fit and how far you can go."
        actions={
          <>
            <Button variant="ghost" icon={RefreshCw} onClick={fetchVehicles}>Refresh</Button>
            <Button variant="primary" icon={Plus} onClick={openNew}>Add vehicle</Button>
          </>
        }
      />

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72" />)}</div>
      ) : loadError ? (
        <EmptyState icon={XCircle} title="Couldn’t load vehicles" text={loadError} action={<Button variant="solid" icon={RefreshCw} onClick={fetchVehicles}>Try again</Button>} />
      ) : vehicles.length === 0 ? (
        <EmptyState
          icon={Car}
          title="Add your first EV"
          text="We’ll use its battery and connector to show compatible chargers and estimate your range."
          action={<Button variant="primary" icon={Plus} onClick={openNew}>Add vehicle</Button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles.map((v) => {
            const soc = Number(v.currentSocPercent ?? v.currentBatteryPct ?? 0);
            const range = Math.round((v.batteryCapacityKwh || 0) * (soc / 100) * KM_PER_KWH);
            return (
              <Card key={v.id} className="p-5 flex flex-col gap-5 transition hover:shadow-card-hover">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-slate-900 truncate">{v.model}</h3>
                    <span className="mt-1 inline-block font-mono text-sm font-semibold text-slate-700 bg-slate-100 rounded-md px-2 py-0.5">{v.licensePlate || v.vehicleNumber}</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(v)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={`Edit ${v.model}`}><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => { setFormError(null); setDeleting(v); }} className="p-2 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${v.model}`}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>

                <div>
                  <div className="flex items-end justify-between">
                    <span className="text-sm font-medium text-slate-600 flex items-center gap-1.5"><BatteryCharging className="w-4 h-4 text-brand-600" /> Charge</span>
                    <span className="text-2xl font-extrabold font-display text-slate-900 tabular-nums">{Math.round(soc)}%</span>
                  </div>
                  <div className="mt-2 h-2.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={Math.round(soc)} aria-valuemin={0} aria-valuemax={100} aria-label="State of charge">
                    <div className={`h-full rounded-full bg-gradient-to-r ${socTone(soc)}`} style={{ width: `${Math.min(100, soc)}%` }} />
                  </div>
                  <div className="mt-1.5 text-sm text-slate-600">About <strong className="text-slate-900">{range} km</strong> of range</div>
                </div>

                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <Spec icon={Gauge} label="Battery" value={`${v.batteryCapacityKwh} kWh`} />
                  <Spec icon={Zap} label="Max DC" value={v.maxChargingPowerKw ? `${v.maxChargingPowerKw} kW` : '—'} />
                  <Spec icon={Plug} label="Connector" value={`${v.connectorType}${v.chemistry ? ` · ${v.chemistry}` : ''}`} />
                  <Spec icon={CalendarDays} label="Year" value={v.year ?? v.manufacturingYear ?? '—'} />
                </dl>

                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  {v.currentSoh ? <Badge tone="brand">Health {Number(v.currentSoh).toFixed(1)}%</Badge> : <span className="text-xs text-slate-500">Health: log a charge</span>}
                  <Button size="sm" variant="ghost" icon={BatteryCharging} onClick={() => setHealthFor(v)}>Battery health</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a vehicle' : 'Edit vehicle'}>
        <form onSubmit={save} className="space-y-4" noValidate>
          <Input label="Model" value={form.model} onChange={set('model')} placeholder="e.g. Tata Nexon EV" required />
          <div className="flex flex-wrap gap-1.5 -mt-1">
            {POPULAR.map((m) => (
              <button type="button" key={m} onClick={() => setForm((f) => ({ ...f, model: m }))} className={`px-2.5 py-1 rounded-lg text-[13px] font-medium transition ${form.model === m ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{m}</button>
            ))}
          </div>
          <Input label="Registration number" value={form.licensePlate} onChange={set('licensePlate')} placeholder="MH 12 AB 1234" required className="font-mono uppercase" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Battery (kWh)" type="number" inputMode="decimal" min="1" step="0.1" value={form.batteryCapacityKwh} onChange={set('batteryCapacityKwh')} placeholder="40.5" required />
            <Input label="Current charge (%)" type="number" inputMode="numeric" min="0" max="100" value={form.currentSocPercent} onChange={set('currentSocPercent')} />
            <Input label="Max DC power (kW)" type="number" inputMode="decimal" min="0" value={form.maxChargingPowerKw} onChange={set('maxChargingPowerKw')} />
            <Input label="Model year" type="number" inputMode="numeric" min="2010" max="2035" value={form.year} onChange={set('year')} />
          </div>
          <label className="block">
            <span className="block text-sm font-semibold text-slate-700 mb-1.5">Battery chemistry</span>
            <select value={form.chemistry} onChange={set('chemistry')} className="w-full rounded-xl border border-slate-300 bg-white py-2.5 px-3 text-[15px] text-slate-900">
              {CHEMISTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-sm font-semibold text-slate-700 mb-1.5">Connector</span>
            <select value={form.connectorType} onChange={set('connectorType')} className="w-full rounded-xl border border-slate-300 bg-white py-2.5 px-3 text-[15px] text-slate-900">
              {CONNECTORS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          {formError && <p role="alert" className="text-sm text-rose-700">{formError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>{editing === 'new' ? 'Add vehicle' : 'Save changes'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!healthFor} onClose={() => setHealthFor(null)} title={`Battery health · ${healthFor?.model || ''}`} size="lg">
        {healthFor && <BatteryHealthPanel vehicle={healthFor} onChanged={fetchVehicles} />}
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Remove this vehicle?" size="sm">
        {deleting && (
          <div className="space-y-5">
            <p className="text-sm text-slate-600"><strong>{deleting.model}</strong> ({deleting.licensePlate || deleting.vehicleNumber}) will be removed from your garage.</p>
            {formError && <p role="alert" className="text-sm text-rose-700">{formError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleting(null)}>Keep it</Button>
              <Button variant="danger" icon={Trash2} loading={saving} onClick={confirmDelete}>Remove</Button>
            </div>
          </div>
        )}
      </Modal>
    </PageShell>
  );
};

function Spec({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <dt className="flex items-center gap-1.5 text-xs text-slate-500"><Icon className="w-3.5 h-3.5" /> {label}</dt>
      <dd className="font-semibold text-slate-900 mt-0.5">{value}</dd>
    </div>
  );
}

function Input({ label, className = '', ...props }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</span>
      <input {...props} className={`w-full rounded-xl border border-slate-300 bg-white py-2.5 px-3 text-[15px] text-slate-900 placeholder:text-slate-400 ${className}`} />
    </label>
  );
}

export default VehiclesPage;
