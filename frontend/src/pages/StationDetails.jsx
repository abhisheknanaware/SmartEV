import { stationPhoto } from '../utils/stationPhoto';
import AmenityIcon from '../components/AmenityIcon';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Zap, PlugZap, MapPin, Clock, Star, CheckCircle2, Calendar, ArrowLeft, ArrowRight,
  Lock, RefreshCw, Send, FileText, Car, ParkingSquare, MessageSquare, Plus,
} from 'lucide-react';
import { stationApi, bookingApi, reviewApi, vehicleApi } from '../services/api';
import ChargingAdvice from '../components/ChargingAdvice';
import { useAuth } from '../context/AuthContext';
import PaymentModal from '../components/PaymentModal';
import InvoiceModal from '../components/InvoiceModal';
import { Card, Badge, Button, Modal, Skeleton } from '../components/ui';

const TIME_SLOTS = Array.from({ length: 17 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`);
const MODE_INFO = {
  FAST: { label: 'Fast DC', icon: Zap, tint: 'text-amber-600 bg-amber-50', kwhHint: '~25 kWh in an hour' },
  NORMAL: { label: 'AC charging', icon: PlugZap, tint: 'text-sky-600 bg-sky-50', kwhHint: '~11 kWh in an hour' },
};
const isFastSlot = (s) => (s.maxKw && s.maxKw >= 50) || s.chargerType?.toLowerCase().includes('ccs') || s.slotNumber?.startsWith('A') || s.slotNumber?.startsWith('F');
const localDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];

const StationDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [station, setStation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const todayStr = localDate();
  const nextHour = `${String(Math.min(22, Math.max(6, new Date().getHours() + 1))).padStart(2, '0')}:00`;
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedMode, setSelectedMode] = useState('FAST');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(nextHour);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [fastSlotsLeft, setFastSlotsLeft] = useState(0);
  const [normalSlotsLeft, setNormalSlotsLeft] = useState(0);

  const [carName, setCarName] = useState('');
  const [vehicleRegNo, setVehicleRegNo] = useState('');
  const [driverName, setDriverName] = useState(user?.name || '');
  const [driverPhone, setDriverPhone] = useState(user?.phone || '');

  // The driver's saved cars: the chosen one fills the booking and drives the charging tip.
  const [vehicles, setVehicles] = useState([]);
  const [myVehicle, setMyVehicle] = useState(null);
  useEffect(() => {
    if (!user) { setVehicles([]); setMyVehicle(null); return; }
    vehicleApi.getAll().then((r) => {
      const list = Array.isArray(r.data) ? r.data : [];
      setVehicles(list);
      setMyVehicle(list[0] || null);
    }).catch(() => setVehicles([]));
  }, [user]);
  useEffect(() => {
    if (!myVehicle) return;
    setCarName(myVehicle.model);
    setVehicleRegNo(myVehicle.licensePlate || myVehicle.vehicleNumber || '');
  }, [myVehicle]);
  useEffect(() => {
    if (user?.name) setDriverName(user.name);
    if (user?.phone) setDriverPhone(user.phone);
  }, [user]);

  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  const [holdData, setHoldData] = useState(null);
  const [holdTimer, setHoldTimer] = useState(600);
  const [isHolding, setIsHolding] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  const [reviewStats, setReviewStats] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState(null);

  // Same formula the server uses for a 1-hour booking: parking per hour + energy at the station tariff.
  const KWH = { FAST: 25, NORMAL: 11 };
  const parking = station?.parkingPricePerHour || 0;
  const tariff = station?.chargingPricePerKwh || 0;
  const priceFor = (mode) => Math.round((parking + tariff * KWH[mode]) * 100) / 100;
  const totalAmount = priceFor(selectedMode);

  const isPast = (time) => selectedDate === todayStr && parseInt(time, 10) <= new Date().getHours();

  const fetchStationData = async () => {
    try {
      setLoading(true);
      const res = await stationApi.getById(id, {
        date: selectedDate,
        startTime: `${selectedTimeSlot}:00`,
        endTime: `${parseInt(selectedTimeSlot.split(':')[0]) + 1}:00:00`,
      });
      const data = res.data;
      setStation(data);
      if (data?.slots?.length) {
        const fast = data.slots.filter(isFastSlot);
        const normal = data.slots.filter((s) => !fast.includes(s));
        setFastSlotsLeft(fast.filter((s) => s.isAvailable).length);
        // Stations without dedicated AC bays sell AC sessions on the shared bays.
        setNormalSlotsLeft((normal.length ? normal : fast).filter((s) => s.isAvailable).length);
        const pool = selectedMode === 'FAST' ? fast : normal;
        setSelectedSlot(pool.find((s) => s.isAvailable) || data.slots.find((s) => s.isAvailable) || null);
      }
    } catch (err) {
      setError('Failed to load station information.');
    } finally {
      setLoading(false);
    }
  };

  const fetchReviews = async () => {
    try {
      const [list, stats] = await Promise.all([reviewApi.getByStation(id), reviewApi.getAiSummary(id)]);
      setReviews(list.data || []);
      setReviewStats(stats.data);
    } catch {
      setReviewStats(null);
    }
  };

  useEffect(() => { fetchStationData(); }, [id, selectedDate, selectedTimeSlot]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchReviews(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Move off a past hour when the date changes to today.
  useEffect(() => {
    if (isPast(selectedTimeSlot)) setSelectedTimeSlot(TIME_SLOTS.find((t) => !isPast(t)) || TIME_SLOTS[TIME_SLOTS.length - 1]);
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!holdData || confirmedBooking) return undefined;
    const t = setInterval(() => setHoldTimer((p) => {
      if (p <= 1) { setHoldData(null); setShowPaymentModal(false); setError('Your 10-minute hold expired. Pick the slot again to book.'); return 0; }
      return p - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [holdData, confirmedBooking]);

  const chooseMode = (mode) => {
    setSelectedMode(mode);
    setHoldData(null);
    if (station?.slots?.length) {
      const fast = station.slots.filter(isFastSlot);
      const pool = mode === 'FAST' ? fast : station.slots.filter((s) => !fast.includes(s));
      setSelectedSlot(pool.find((s) => s.isAvailable) || station.slots.find((s) => s.isAvailable) || null);
    }
  };

  const handleOpenVehicleModal = () => {
    if (!user) { navigate('/login'); return; }
    setError(null);
    setShowVehicleModal(true);
  };

  const handleProceedToPayment = async () => {
    if (!selectedSlot) { setError('No bay is free for this time. Pick another time slot.'); return; }
    if (!carName.trim() || !vehicleRegNo.trim()) { setError('Add your car and number plate to book.'); return; }
    try {
      setIsHolding(true);
      setError(null);
      const endHour = parseInt(selectedTimeSlot.split(':')[0]) + 1;
      // The server prices the booking and attaches the driver's own vehicle; we only send the choice.
      const res = await bookingApi.createHold({
        stationId: parseInt(id),
        slotId: selectedSlot.id,
        bookingDate: selectedDate,
        startTime: `${selectedTimeSlot}:00`,
        endTime: `${String(endHour).padStart(2, '0')}:00:00`,
        chargingKwh: KWH[selectedMode],
        vehicleModel: carName,
        vehicleNumber: vehicleRegNo,
        userName: driverName || user?.name,
        userPhone: driverPhone || user?.phone,
        totalHours: 1.0,
      });
      setHoldData(res.data);
      setHoldTimer(res.data.holdExpiresInSeconds || 600);
      setShowVehicleModal(false);
      setShowPaymentModal(true);
    } catch (err) {
      const status = err.response?.status;
      setError(
        status === 409 ? 'That bay was just reserved by someone else. Pick another time or bay.'
          : status === 401 ? 'Please log in again to book.'
            : err.response?.data?.message || 'We couldn’t reserve the bay. Please try again.'
      );
    } finally {
      setIsHolding(false);
    }
  };

  const handlePaymentSuccess = async (paymentResult) => {
    setShowPaymentModal(false);
    setError(null);
    try {
      const res = await bookingApi.verifyPayment({
        bookingId: holdData.bookingId,
        razorpayOrderId: holdData.razorpayOrderId,
        razorpayPaymentId: paymentResult.paymentId,
        razorpaySignature: paymentResult.signature || 'sig_test_upi',
      });
      setConfirmedBooking(res.data);
      navigate('/bookings', { state: { newBooking: res.data, justBooked: true } });
    } catch (err) {
      setError(
        err.response?.data?.message
          ? `Payment could not be confirmed: ${err.response.data.message}`
          : `We couldn’t confirm your payment. If you were charged, contact support with reference ${holdData?.bookingReference}.`
      );
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    try {
      setSubmittingReview(true);
      setReviewError(null);
      await reviewApi.addReview(parseInt(id), newRating, newComment.trim());
      setNewComment('');
      setNewRating(5);
      fetchReviews();
    } catch (err) {
      setReviewError(err.response?.data?.message || 'Your review could not be posted. Please try again.');
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading && !station) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <Skeleton className="h-72 rounded-3xl" />
        <div className="grid lg:grid-cols-3 gap-5"><Skeleton className="h-80 lg:col-span-2" /><Skeleton className="h-80" /></div>
      </div>
    );
  }

  const amenities = station?.amenities ? station.amenities.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const slotsLeft = selectedMode === 'FAST' ? fastSlotsLeft : normalSlotsLeft;
  const mode = MODE_INFO[selectedMode];

  return (
    <div className="min-h-screen pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {error && !showVehicleModal && (
          <div role="alert" className="flex items-start justify-between gap-4 rounded-2xl bg-rose-50 ring-1 ring-rose-200 px-5 py-4 text-sm text-rose-800">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="font-semibold text-rose-700 hover:text-rose-900 shrink-0">Dismiss</button>
          </div>
        )}

        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl bg-ink-900 shadow-card">
          <img src={stationPhoto(station)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-ink-950/10" />
          <div className="relative p-5 sm:p-8 min-h-[18rem] sm:min-h-[22rem] flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <button onClick={() => navigate('/dashboard')} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur px-3 py-1.5 text-sm font-medium text-white">
                <ArrowLeft className="w-4 h-4" /> Stations
              </button>
              {station?.rating > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-sm font-semibold text-white">
                  <Star className="w-4 h-4 text-amber-300 fill-amber-300" /> {station.rating.toFixed(1)}
                  {reviewStats?.totalReviews > 0 && <span className="font-normal text-white/70">({reviewStats.totalReviews})</span>}
                </span>
              )}
            </div>
            <div className="mt-auto">
              <div className="flex flex-wrap gap-2 mb-3">
                {station?.maxChargingSpeedKw && <span className="inline-flex items-center gap-1 rounded-full bg-brand-400 px-3 py-1 text-xs font-bold text-ink-950"><Zap className="w-3.5 h-3.5" /> Up to {station.maxChargingSpeedKw} kW</span>}
                {station?.openingHours && <span className="inline-flex items-center gap-1 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-xs font-semibold text-white"><Clock className="w-3.5 h-3.5" /> {station.openingHours}</span>}
                {station?.totalSlots > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-xs font-semibold text-white"><ParkingSquare className="w-3.5 h-3.5" /> {station.totalSlots} bays</span>}
              </div>
              <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white">{station?.name}</h1>
              <p className="mt-2 flex items-center gap-1.5 text-sm sm:text-base text-slate-200"><MapPin className="w-4 h-4 text-brand-300 shrink-0" /> {[station?.address, station?.city].filter(Boolean).join(', ')}</p>
            </div>
          </div>
        </section>

        {amenities.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 mr-1">On site</span>
            {amenities.map((a) => (
              <span key={a} className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200">
                <AmenityIcon label={a} className="w-4 h-4 text-brand-600" /> {a}
              </span>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6 items-start">
          {/* Slot picker */}
          <Card className="lg:col-span-2 p-5 sm:p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900">Book a bay</h2>
              <label className="inline-flex items-center gap-2 rounded-xl bg-slate-50 ring-1 ring-slate-200 pl-3 pr-1 py-1 text-sm">
                <Calendar className="w-4 h-4 text-brand-600" />
                <span className="sr-only">Date</span>
                <input type="date" min={todayStr} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent py-1 font-semibold text-slate-800 focus:outline-none" />
              </label>
            </div>

            <fieldset>
              <legend className="text-sm font-semibold text-slate-700 mb-2.5">Charging type</legend>
              <div className="grid sm:grid-cols-2 gap-3">
                {Object.entries(MODE_INFO).map(([key, m]) => {
                  const on = selectedMode === key;
                  const Icon = m.icon;
                  const free = key === 'FAST' ? fastSlotsLeft : normalSlotsLeft;
                  return (
                    <button key={key} type="button" onClick={() => chooseMode(key)} aria-pressed={on}
                      className={`text-left rounded-2xl p-4 transition ring-1 ${on ? 'ring-2 ring-brand-500 bg-brand-50/50' : 'ring-slate-200 hover:ring-slate-300 bg-white'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.tint}`}><Icon className="w-5 h-5" /></span>
                        <span className="text-right">
                          <span className="block font-display text-xl font-extrabold text-slate-900 tabular-nums">₹{priceFor(key).toFixed(0)}</span>
                          <span className="block text-xs text-slate-500">per hour</span>
                        </span>
                      </div>
                      <div className="mt-3 font-semibold text-slate-900">{m.label}</div>
                      <div className="text-xs text-slate-500">{m.kwhHint}</div>
                      <div className={`mt-2 text-xs font-semibold ${free > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {free > 0 ? `${free} bay${free > 1 ? 's' : ''} free at ${selectedTimeSlot}` : `Full at ${selectedTimeSlot}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold text-slate-700 mb-2.5">Start time <span className="font-normal text-slate-500">(1-hour slot)</span></legend>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {TIME_SLOTS.map((time) => {
                  const on = selectedTimeSlot === time;
                  const past = isPast(time);
                  return (
                    <button key={time} type="button" disabled={past} onClick={() => { setSelectedTimeSlot(time); setHoldData(null); }} aria-pressed={on}
                      className={`rounded-xl py-2.5 text-sm font-semibold tabular-nums transition ${
                        on ? 'bg-brand-600 text-white shadow-md shadow-brand-600/25' : past ? 'bg-slate-50 text-slate-300 line-through cursor-not-allowed' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-brand-400 hover:text-brand-700'
                      }`}>
                      {time}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </Card>

          {/* Side column */}
          <div className="space-y-6">
            {myVehicle && <ChargingAdvice vehicle={myVehicle} chargerKw={station?.maxChargingSpeedKw} mode={selectedMode} />}

            <Card className="p-5 sm:p-6">
              <h2 className="text-lg font-bold text-slate-900">Price</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between text-slate-600"><dt>Parking, 1 hour</dt><dd className="tabular-nums">₹{parking.toFixed(2)}</dd></div>
                <div className="flex justify-between text-slate-600"><dt>Energy, {KWH[selectedMode]} kWh × ₹{tariff}</dt><dd className="tabular-nums">₹{(tariff * KWH[selectedMode]).toFixed(2)}</dd></div>
                <div className="flex justify-between border-t border-slate-100 pt-3 text-base font-bold text-slate-900"><dt>Total</dt><dd className="tabular-nums">₹{totalAmount.toFixed(2)}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-slate-500">Includes GST. Energy is estimated for one hour of {mode.label.toLowerCase()}.</p>
            </Card>
          </div>
        </div>

        {/* Reviews */}
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><MessageSquare className="w-5 h-5 text-brand-600" /> Driver reviews</h2>
            {reviewStats?.totalReviews > 0 && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="inline-flex items-center gap-1 font-bold text-slate-900"><Star className="w-4 h-4 text-amber-400 fill-amber-400" /> {reviewStats.averageRating}</span>
                <span>from {reviewStats.totalReviews} review{reviewStats.totalReviews > 1 ? 's' : ''}</span>
                <Badge tone="green">{reviewStats.positivePct}% rate it 4+ stars</Badge>
              </div>
            )}
          </div>

          {reviews.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No reviews yet. Charged here? Be the first to share how it went.</p>
          ) : (
            <ul className="mt-4 grid md:grid-cols-2 gap-3">
              {reviews.slice(0, 6).map((r) => (
                <li key={r.id} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{r.user?.name || 'Driver'}</span>
                    <span className="flex" aria-label={`${r.rating} of 5 stars`}>
                      {[1, 2, 3, 4, 5].map((s) => <Star key={s} className={`w-3.5 h-3.5 ${s <= Math.round(r.rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />)}
                    </span>
                  </div>
                  {r.comment && <p className="mt-1.5 text-sm text-slate-600">{r.comment}</p>}
                  {r.createdAt && <p className="mt-2 text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
                </li>
              ))}
            </ul>
          )}

          {user && (
            <form onSubmit={handleSubmitReview} className="mt-5 pt-5 border-t border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="flex items-center" role="radiogroup" aria-label="Your rating">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button type="button" key={star} role="radio" aria-checked={star === newRating} aria-label={`${star} star${star > 1 ? 's' : ''}`} onClick={() => setNewRating(star)} className="p-1">
                    <Star className={`w-5 h-5 ${star <= newRating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
                  </button>
                ))}
              </div>
              <input type="text" value={newComment} maxLength={1000} onChange={(e) => setNewComment(e.target.value)} aria-label="Your review"
                placeholder="How was the charging speed, queue and amenities?"
                className="flex-1 rounded-xl bg-slate-50 ring-1 ring-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <Button type="submit" variant="solid" icon={Send} loading={submittingReview} disabled={!newComment.trim()}>Post</Button>
            </form>
          )}
          {reviewError && <p role="alert" className="mt-2 text-sm text-rose-700">{reviewError}</p>}
        </Card>
      </div>

      {/* Sticky booking bar: portalled to <body> so the page footer can't cover it */}
      {createPortal(
      <div className="fixed inset-x-0 bottom-0 z-50 px-3 sm:px-6 pb-3 sm:pb-5 pointer-events-none">
        <div className="pointer-events-auto max-w-5xl mx-auto rounded-2xl bg-white/95 backdrop-blur-md text-slate-900 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] ring-1 ring-slate-200 px-4 sm:px-6 py-3.5 flex items-center gap-4">
          <span className={`hidden sm:flex w-10 h-10 rounded-xl items-center justify-center ${mode.tint}`}><mode.icon className="w-5 h-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">{mode.label} · {new Date(`${selectedDate}T00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} at {selectedTimeSlot}</div>
            <div className="text-xs text-slate-500 truncate">{carName ? `${carName}${vehicleRegNo ? ` · ${vehicleRegNo}` : ''}` : user ? 'Add your car when you book' : 'Log in to book'}{slotsLeft === 0 ? ' · no bay free' : ''}</div>
          </div>
          <div className="text-right">
            <div className="font-display text-xl sm:text-2xl font-extrabold tabular-nums">₹{totalAmount.toFixed(0)}</div>
          </div>
          {!user ? (
            <Button variant="primary" icon={Lock} onClick={() => navigate('/login')}>Log in to book</Button>
          ) : confirmedBooking ? (
            <div className="flex gap-2">
              <Button variant="secondary" icon={FileText} onClick={() => setShowInvoiceModal(true)}>Invoice</Button>
              <Button as={Link} to="/bookings" variant="primary" icon={CheckCircle2}>My bookings</Button>
            </div>
          ) : (
            <Button variant="primary" loading={isHolding} disabled={slotsLeft === 0} onClick={handleOpenVehicleModal}>
              Book <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>,
      document.body)}

      {/* Booking details */}
      <Modal open={showVehicleModal} onClose={() => setShowVehicleModal(false)} title="Confirm your booking">
        <div className="space-y-5">
          <div className="rounded-2xl bg-slate-50 p-4 text-sm">
            <div className="font-semibold text-slate-900">{station?.name}</div>
            <div className="mt-0.5 text-slate-600">{mode.label} · {selectedDate} at {selectedTimeSlot} · Bay {selectedSlot?.slotNumber || '-'}</div>
          </div>

          <div>
            <div className="text-sm font-semibold text-slate-700 mb-2">Car</div>
            {vehicles.length > 0 ? (
              <div className="space-y-2">
                {vehicles.map((v) => {
                  const on = myVehicle?.id === v.id;
                  return (
                    <label key={v.id} className={`flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer transition ring-1 ${on ? 'ring-2 ring-brand-500 bg-brand-50/50' : 'ring-slate-200 hover:ring-slate-300'}`}>
                      <input type="radio" name="booking-car" checked={on} onChange={() => setMyVehicle(v)} className="sr-only" />
                      <Car className={`w-5 h-5 ${on ? 'text-brand-600' : 'text-slate-400'}`} />
                      <span className="flex-1 text-sm"><span className="font-semibold text-slate-900">{v.model}</span> <span className="text-slate-500">· {v.licensePlate}</span></span>
                      {on && <CheckCircle2 className="w-5 h-5 text-brand-600" />}
                    </label>
                  );
                })}
                <Link to="/vehicles" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800"><Plus className="w-4 h-4" /> Add another car</Link>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 mb-1">Model</span>
                  <input value={carName} onChange={(e) => setCarName(e.target.value)} placeholder="e.g. Tata Nexon EV" className="w-full rounded-xl ring-1 ring-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 mb-1">Number plate</span>
                  <input value={vehicleRegNo} onChange={(e) => setVehicleRegNo(e.target.value.toUpperCase())} placeholder="MH 12 AB 1234" className="w-full rounded-xl ring-1 ring-slate-300 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </label>
                <p className="sm:col-span-2 text-xs text-slate-500">Save it in <Link to="/vehicles" className="font-semibold text-brand-700">My vehicles</Link> to book in one tap and get charging tips.</p>
              </div>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Driver name</span>
              <input value={driverName} onChange={(e) => setDriverName(e.target.value)} className="w-full rounded-xl ring-1 ring-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Phone</span>
              <input type="tel" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} placeholder="+91" className="w-full rounded-xl ring-1 ring-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-brand-50 ring-1 ring-brand-200 px-4 py-3 text-slate-900">
            <span className="text-sm text-slate-600">Total, incl. GST</span>
            <span className="font-display text-xl font-extrabold tabular-nums">₹{totalAmount.toFixed(2)}</span>
          </div>

          {error && <div role="alert" className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-800">{error}</div>}

          <Button variant="primary" size="lg" className="w-full" icon={Lock} loading={isHolding} onClick={handleProceedToPayment}>
            {isHolding ? 'Reserving your bay…' : 'Reserve and continue to payment'}
          </Button>
          <p className="text-center text-xs text-slate-500">The bay is held for 10 minutes while you pay.</p>
        </div>
      </Modal>

      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        amount={holdData?.totalAmount ?? totalAmount}
        expiresIn={holdData ? holdTimer : 0}
        bookingDetails={{
          stationName: station?.name,
          slotNumber: holdData?.slotNumber || selectedSlot?.slotNumber,
          date: selectedDate,
          time: selectedTimeSlot,
          modeLabel: mode.label,
        }}
        onPaymentSuccess={handlePaymentSuccess}
      />

      <InvoiceModal isOpen={showInvoiceModal} onClose={() => setShowInvoiceModal(false)} booking={confirmedBooking} />
    </div>
  );
};

export default StationDetails;
