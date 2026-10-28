import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  CalendarCheck, Clock, MapPin, Zap, QrCode, CheckCircle2, RefreshCw, Car, FileText,
  Star, XCircle, Wallet, CalendarClock, BatteryCharging, X, Navigation,
} from 'lucide-react';
import { bookingApi, reviewApi, vehicleApi } from '../services/api';
import { LogChargeForm } from '../components/BatteryHealth';
import { useAuth } from '../context/AuthContext';
import InvoiceModal, { qrSrc } from '../components/InvoiceModal';
import { PageShell, PageHeader, Card, Stat, StatusBadge, Button, EmptyState, Skeleton, Modal } from '../components/ui';

const ACTIVE = ['HELD', 'PENDING', 'CONFIRMED', 'OCCUPIED'];
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const hhmm = (t) => (t ? String(t).slice(0, 5) : '—');
const startsAt = (b) => new Date(`${b.bookingDate}T${hhmm(b.startTime)}:00`).getTime();

const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'all', label: 'All' },
];

const BookingsPage = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState('upcoming');
  const [qrBooking, setQrBooking] = useState(null);
  const [invoiceBooking, setInvoiceBooking] = useState(null);
  const [reviewBooking, setReviewBooking] = useState(null);
  const [cancelBooking, setCancelBooking] = useState(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [reviewDone, setReviewDone] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [logFor, setLogFor] = useState(null); // booking whose charge result is being logged
  const [logVehicleId, setLogVehicleId] = useState(null);
  const [bannerClosed, setBannerClosed] = useState(false);

  const fetchBookings = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await bookingApi.getMyBookings();
      setBookings(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'We couldn’t load your bookings. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
    vehicleApi.getAll().then((r) => setVehicles(Array.isArray(r.data) ? r.data : [])).catch(() => setVehicles([]));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openLog = (b) => {
    const plate = (b.vehicleNumber || '').replace(/\s/g, '').toUpperCase();
    const match = vehicles.find((v) => (v.licensePlate || v.vehicleNumber || '').replace(/\s/g, '').toUpperCase() === plate) || vehicles[0];
    setLogVehicleId(match?.id ?? null);
    setLogFor(b);
  };

  const now = Date.now();
  const groups = useMemo(() => {
    const sorted = [...bookings].sort((a, b) => startsAt(b) - startsAt(a));
    return {
      upcoming: sorted.filter((b) => ACTIVE.includes(b.status) && startsAt(b) >= now - 3600e3).reverse(),
      past: sorted.filter((b) => b.status === 'COMPLETED' || (b.status !== 'CANCELLED' && startsAt(b) < now - 3600e3)),
      cancelled: sorted.filter((b) => b.status === 'CANCELLED'),
      all: sorted,
    };
  }, [bookings, now]);

  const stats = useMemo(() => {
    const paid = bookings.filter((b) => ['CONFIRMED', 'OCCUPIED', 'COMPLETED'].includes(b.status));
    return {
      upcoming: groups.upcoming.length,
      sessions: paid.length,
      kwh: paid.reduce((s, b) => s + (b.chargingKwh || 0), 0),
      spent: paid.reduce((s, b) => s + (b.totalAmount || 0), 0),
    };
  }, [bookings, groups]);

  const openReview = (b) => {
    setReviewBooking(b);
    setRating(5);
    setComment('');
    setFormError(null);
    setReviewDone(false);
  };

  const submitReview = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await reviewApi.addReview(reviewBooking.stationId, rating, comment.trim());
      setReviewDone(true);
      setTimeout(() => setReviewBooking(null), 1400);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Your review could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = async () => {
    setBusy(true);
    setFormError(null);
    try {
      await bookingApi.cancel(cancelBooking.id);
      setCancelBooking(null);
      fetchBookings();
    } catch (err) {
      setFormError(err.response?.data?.message || 'The booking could not be cancelled. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const list = groups[tab];
  const nextUp = tab === 'upcoming' ? groups.upcoming.find((b) => b.status !== 'HELD') : null;
  const justBooked = location.state?.justBooked ? location.state.newBooking : null;

  return (
    <PageShell>
      <PageHeader
        icon={CalendarCheck}
        eyebrow="Your charging"
        title="My bookings"
        subtitle="Upcoming reservations, QR gate passes and receipts in one place."
        actions={
          <>
            <Button variant="ghost" icon={RefreshCw} onClick={fetchBookings} aria-label="Refresh bookings">Refresh</Button>
            <Button as={Link} to="/dashboard" variant="primary" icon={Zap}>Book a slot</Button>
          </>
        }
      />

      {justBooked && !bannerClosed && (
        <div role="status" className="flex items-center gap-3.5 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0 text-sm">
            <span className="font-semibold text-emerald-950">Booking confirmed and paid.</span>{' '}
            <span className="text-emerald-800">{justBooked.stationName}, bay {justBooked.slotNumber} is yours.</span>
          </div>
          <Button size="sm" variant="ghost" icon={FileText} onClick={() => setInvoiceBooking(justBooked)}>Invoice</Button>
          <button onClick={() => setBannerClosed(true)} className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-100" aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}

      {nextUp && (
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white via-brand-50 to-sky-50 ring-1 ring-brand-200 text-slate-900 shadow-card">
          <div className="absolute -right-24 -top-24 w-72 h-72 rounded-full bg-brand-300/30 blur-3xl" aria-hidden="true" />
          <div className="relative p-5 sm:p-7 flex flex-col md:flex-row md:items-center gap-5 md:gap-8">
            <DateTile date={nextUp.bookingDate} />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Next up <span className="normal-case tracking-normal font-medium text-slate-500">· {relTime(startsAt(nextUp) - now)}</span>
              </div>
              <h2 className="mt-1 font-display text-2xl sm:text-3xl font-extrabold truncate">{nextUp.stationName}</h2>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                <span className="inline-flex items-center gap-1.5"><Clock className="w-4 h-4 text-brand-600" /> {hhmm(nextUp.startTime)} – {hhmm(nextUp.endTime)}</span>
                <span className="inline-flex items-center gap-1.5"><Zap className="w-4 h-4 text-brand-600" /> Bay {nextUp.slotNumber}{nextUp.chargerType ? ` · ${nextUp.chargerType}` : ''}</span>
                {nextUp.vehicleModel && <span className="inline-flex items-center gap-1.5"><Car className="w-4 h-4 text-brand-600" /> {nextUp.vehicleModel}</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={QrCode} onClick={() => setQrBooking(nextUp)}>Gate pass</Button>
              {nextUp.stationLat && nextUp.stationLng && (
                <Button as="a" href={`https://www.google.com/maps/dir/?api=1&destination=${nextUp.stationLat},${nextUp.stationLng}`} target="_blank" rel="noreferrer"
                  icon={Navigation}>Directions</Button>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat icon={CalendarClock} label="Upcoming" value={stats.upcoming} tone="brand" />
        <Stat icon={BatteryCharging} label="Paid sessions" value={stats.sessions} tone="sky" />
        <Stat icon={Zap} label="Energy booked" value={`${stats.kwh.toFixed(1)} kWh`} tone="violet" />
        <Stat icon={Wallet} label="Total spent" value={inr(stats.spent)} tone="amber" />
      </div>

      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit max-w-full overflow-x-auto" role="tablist" aria-label="Filter bookings">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition ${tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-slate-500 tabular-nums">{groups[t.id].length}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : loadError ? (
        <EmptyState icon={XCircle} title="Couldn’t load bookings" text={loadError} action={<Button variant="solid" icon={RefreshCw} onClick={fetchBookings}>Try again</Button>} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title={tab === 'upcoming' ? 'No upcoming bookings' : 'Nothing here yet'}
          text={tab === 'upcoming' ? 'Find a station on your route and reserve a bay. It’s held for 10 minutes while you pay.' : 'Bookings will appear here as you charge.'}
          action={<Button as={Link} to="/dashboard" variant="primary" icon={Zap}>Find a station</Button>}
        />
      ) : (
        <ul className="space-y-3">
          {list.map((b) => {
            const cancelled = b.status === 'CANCELLED';
            const paid = ['CONFIRMED', 'OCCUPIED', 'COMPLETED'].includes(b.status);
            const canCancel = ACTIVE.includes(b.status) && startsAt(b) > now;
            return (
              <li key={b.id}>
                <Card className={`p-4 sm:p-5 grid gap-4 sm:gap-5 grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1.6fr)_repeat(2,minmax(0,1fr))_auto] items-center transition hover:shadow-card-hover ${cancelled ? 'opacity-70' : ''}`}>
                  <DateTile date={b.bookingDate} muted={cancelled} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-900 truncate">{b.stationName}</h3>
                      <StatusBadge status={b.status} />
                    </div>
                    <div className="mt-1 text-sm text-slate-600 tabular-nums">
                      <Clock className="inline w-3.5 h-3.5 mr-1 align-[-2px] text-slate-400" />{hhmm(b.startTime)} – {hhmm(b.endTime)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{b.stationAddress}</span>
                      <span className="font-mono shrink-0">· {b.bookingReference}</span>
                    </div>
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-4 lg:contents">
                  <Detail label="Bay" icon={Zap}>
                    <div className="font-semibold text-slate-900">{b.slotNumber}</div>
                    <div className="text-slate-600 truncate">{b.chargerType || 'Charger'}{b.chargingKwh ? ` · ${b.chargingKwh} kWh` : ''}</div>
                  </Detail>
                  <Detail label={paid ? 'Paid' : 'Amount'} icon={Car}>
                    <div className="font-semibold text-slate-900 tabular-nums">{inr(b.totalAmount)}</div>
                    <div className="text-slate-600 truncate">{b.vehicleModel || b.vehicleNumber || 'Vehicle not set'}</div>
                  </Detail>
                  </div>

                  <div className="col-span-2 lg:col-span-1 flex flex-wrap gap-2 lg:justify-end">
                    {paid && <Button size="sm" variant="dark" icon={QrCode} onClick={() => setQrBooking(b)}>QR pass</Button>}
                    {paid && <Button size="sm" icon={FileText} onClick={() => setInvoiceBooking(b)}>Invoice</Button>}
                    {(paid || b.status === 'COMPLETED') && <Button size="sm" variant="ghost" icon={Star} onClick={() => openReview(b)}>Rate</Button>}
                    {['CONFIRMED', 'OCCUPIED'].includes(b.status) && startsAt(b) <= now && (
                      <Button size="sm" variant="solid" icon={BatteryCharging} onClick={() => openLog(b)}>Log charge</Button>
                    )}
                    {canCancel && <Button size="sm" variant="danger" icon={XCircle} onClick={() => { setFormError(null); setCancelBooking(b); }}>Cancel</Button>}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={!!qrBooking} onClose={() => setQrBooking(null)} title="Gate entry pass" size="sm">
        {qrBooking && (
          <div className="text-center space-y-4">
            <p className="text-sm text-slate-600">Show this at <strong>{qrBooking.stationName}</strong> to unlock bay {qrBooking.slotNumber}.</p>
            <div className="inline-block p-4 rounded-2xl bg-white ring-1 ring-slate-200 shadow-card">
              {qrBooking.qrCodeBase64 ? (
                <img src={qrSrc(qrBooking.qrCodeBase64)} alt={`QR pass for booking ${qrBooking.bookingReference}`} className="w-52 h-52" />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center text-sm text-slate-500">QR code not available yet</div>
              )}
            </div>
            <div className="text-sm font-mono font-semibold text-slate-800 bg-slate-50 rounded-xl py-2">{qrBooking.bookingReference}</div>
            <div className="text-sm text-slate-600">{fmtDate(qrBooking.bookingDate)} · {hhmm(qrBooking.startTime)} – {hhmm(qrBooking.endTime)}</div>
          </div>
        )}
      </Modal>

      <Modal open={!!reviewBooking} onClose={() => setReviewBooking(null)} title={`Rate ${reviewBooking?.stationName || 'this station'}`}>
        {reviewDone ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
            <p className="mt-3 font-semibold text-slate-900">Thanks! Your review is published.</p>
          </div>
        ) : (
          <form onSubmit={submitReview} className="space-y-5">
            <fieldset>
              <legend className="text-sm font-semibold text-slate-700 mb-2">Your rating</legend>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={rating === n} className="p-1 rounded-lg hover:bg-amber-50">
                    <Star className={`w-8 h-8 ${n <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="block">
              <span className="block text-sm font-semibold text-slate-700 mb-1.5">Comments (optional)</span>
              <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Charging speed, cleanliness, amenities…" className="w-full rounded-xl border border-slate-300 p-3 text-[15px] text-slate-900" />
            </label>
            {formError && <p role="alert" className="text-sm text-rose-700">{formError}</p>}
            <Button type="submit" variant="primary" className="w-full" loading={busy}>Publish review</Button>
          </form>
        )}
      </Modal>

      <Modal open={!!cancelBooking} onClose={() => setCancelBooking(null)} title="Cancel this booking?" size="sm">
        {cancelBooking && (
          <div className="space-y-5">
            <p className="text-sm text-slate-600">
              Bay {cancelBooking.slotNumber} at <strong>{cancelBooking.stationName}</strong> on {fmtDate(cancelBooking.bookingDate)} will be released for other drivers.
            </p>
            {formError && <p role="alert" className="text-sm text-rose-700">{formError}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setCancelBooking(null)}>Keep booking</Button>
              <Button variant="danger" icon={XCircle} loading={busy} onClick={confirmCancel}>Cancel booking</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!logFor} onClose={() => setLogFor(null)} title="Log this charge">
        {logFor && (vehicles.length === 0 ? (
          <div className="space-y-4 text-sm text-slate-600">
            <p>Add your car in My vehicles first, so the charge can be turned into a battery-health reading.</p>
            <Button as={Link} to="/vehicles" variant="primary">Go to My vehicles</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {logFor.stationName}, {fmtDate(logFor.bookingDate)}. Enter what the charger and your car showed; we’ll estimate your battery’s real capacity from it.
            </p>
            {vehicles.length > 1 && (
              <label className="block">
                <span className="block text-sm font-semibold text-slate-700 mb-1.5">Vehicle</span>
                <select value={logVehicleId ?? ''} onChange={(e) => setLogVehicleId(Number(e.target.value))} className="w-full rounded-xl border border-slate-300 bg-white py-2.5 px-3 text-[15px] text-slate-900">
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.model} · {v.licensePlate || v.vehicleNumber}</option>)}
                </select>
              </label>
            )}
            <LogChargeForm
              key={logVehicleId}
              vehicle={vehicles.find((v) => v.id === logVehicleId) || vehicles[0]}
              bookingId={logFor.id}
              defaultType={/ac|type 2/i.test(logFor.chargerType || '') ? 'AC' : 'DC'}
              onSaved={() => { setLogFor(null); fetchBookings(); }}
              onCancel={() => setLogFor(null)}
            />
          </div>
        ))}
      </Modal>

      <InvoiceModal isOpen={!!invoiceBooking} onClose={() => setInvoiceBooking(null)} booking={invoiceBooking} />
    </PageShell>
  );
};

const relTime = (ms) => {
  if (ms <= 0) return 'happening now';
  const h = Math.round(ms / 3600e3);
  if (h < 1) return `starts in ${Math.max(1, Math.round(ms / 60e3))} min`;
  if (h < 24) return `starts in ${h} h`;
  const d = Math.round(h / 24);
  return `in ${d} day${d > 1 ? 's' : ''}`;
};

function DateTile({ date, dark = false, muted = false }) {
  const d = date ? new Date(`${date}T00:00:00`) : null;
  return (
    <div className={`shrink-0 w-14 sm:w-16 rounded-2xl text-center py-2 ${dark ? 'bg-white/10 ring-1 ring-white/15' : muted ? 'bg-slate-100' : 'bg-brand-50 ring-1 ring-brand-100'}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wider ${dark ? 'text-brand-300' : muted ? 'text-slate-400' : 'text-brand-700'}`}>{d ? d.toLocaleDateString('en-IN', { month: 'short' }) : '-'}</div>
      <div className={`font-display text-2xl font-extrabold leading-none mt-0.5 ${dark ? 'text-white' : muted ? 'text-slate-500' : 'text-slate-900'}`}>{d ? d.getDate() : '-'}</div>
      <div className={`text-[11px] mt-0.5 ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{d ? d.toLocaleDateString('en-IN', { weekday: 'short' }) : ''}</div>
    </div>
  );
}

function Detail({ label, icon: Icon, children }) {
  return (
    <div className="text-sm min-w-0">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-0.5">
        <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {label}
      </div>
      {children}
    </div>
  );
}

export default BookingsPage;
