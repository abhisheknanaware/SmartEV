import React, { useEffect, useState } from 'react';
import { Smartphone, CreditCard, Building2, Check, Timer, MapPin, CalendarClock, FlaskConical } from 'lucide-react';
import { Modal, Button } from './ui';

const METHODS = [
  { id: 'UPI', label: 'UPI', hint: 'Any UPI app', icon: Smartphone },
  { id: 'Card', label: 'Card', hint: 'Debit or credit', icon: CreditCard },
  { id: 'Netbanking', label: 'Net banking', hint: 'Indian banks', icon: Building2 },
];

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Checkout step for a held bay. This build has no live payment gateway in the browser,
 * so the payment is simulated and labelled as such; the server still verifies and confirms the booking.
 */
const PaymentModal = ({ isOpen, onClose, amount, bookingDetails = {}, expiresIn, onPaymentSuccess }) => {
  const [method, setMethod] = useState('UPI');
  const [stage, setStage] = useState('choose'); // choose | paying | done

  useEffect(() => { if (isOpen) setStage('choose'); }, [isOpen]);

  const fare = Number(amount || 0).toFixed(2);
  const pay = () => {
    setStage('paying');
    setTimeout(() => {
      setStage('done');
      setTimeout(() => onPaymentSuccess({
        paymentId: `pay_test_${Date.now().toString(36)}`,
        method,
        amount: Number(fare),
        timestamp: new Date().toISOString(),
      }), 700);
    }, 900);
  };

  const { stationName, slotNumber, date, time, modeLabel } = bookingDetails;

  return (
    <Modal open={isOpen} onClose={stage === 'choose' ? onClose : () => {}} title="Pay for your booking" size="lg">
      {stage !== 'choose' ? (
        <div className="py-10 text-center" role="status" aria-live="polite">
          <span className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${stage === 'done' ? 'bg-emerald-500 text-white' : 'bg-brand-50 text-brand-600'}`}>
            {stage === 'done' ? <Check className="w-8 h-8" strokeWidth={3} /> : <span className="w-7 h-7 rounded-full border-[3px] border-brand-200 border-t-brand-600 animate-spin" />}
          </span>
          <h3 className="mt-5 text-lg font-bold text-slate-900">{stage === 'done' ? 'Payment received' : 'Confirming payment'}</h3>
          <p className="mt-1 text-sm text-slate-500">{stage === 'done' ? 'Confirming your bay with the station…' : `₹${fare} by ${method}. Please keep this window open.`}</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-[1fr_1.15fr] gap-6">
          <section className="rounded-2xl bg-gradient-to-br from-brand-50 to-sky-50 ring-1 ring-brand-200 text-slate-900 p-5 flex flex-col">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Booking summary</div>
            <div className="mt-3 font-display text-lg font-bold leading-snug">{stationName}</div>
            <dl className="mt-4 space-y-2.5 text-sm text-slate-600">
              <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-brand-600" /> Bay {slotNumber}{modeLabel ? ` · ${modeLabel}` : ''}</div>
              {date && <div className="flex items-center gap-2"><CalendarClock className="w-4 h-4 text-brand-600" /> {date} at {time}</div>}
            </dl>
            <div className="mt-auto pt-6">
              <div className="text-xs text-slate-500">Total, incl. GST</div>
              <div className="font-display text-3xl font-extrabold tabular-nums">₹{fare}</div>
              {expiresIn > 0 && (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                  <Timer className="w-3.5 h-3.5 text-amber-600" /> Bay held for {mmss(expiresIn)}
                </div>
              )}
            </div>
          </section>

          <section className="flex flex-col">
            <fieldset>
              <legend className="text-sm font-semibold text-slate-700 mb-2.5">Payment method</legend>
              <div className="space-y-2">
                {METHODS.map(({ id, label, hint, icon: Icon }) => {
                  const on = method === id;
                  return (
                    <label key={id} className={`flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer ring-1 transition ${on ? 'ring-2 ring-brand-500 bg-brand-50/60' : 'ring-slate-200 hover:ring-slate-300'}`}>
                      <input type="radio" name="pay-method" value={id} checked={on} onChange={() => setMethod(id)} className="sr-only" />
                      <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}><Icon className="w-[18px] h-[18px]" /></span>
                      <span className="flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{label}</span>
                        <span className="block text-xs text-slate-500">{hint}</span>
                      </span>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center ${on ? 'bg-brand-600 text-white' : 'ring-1 ring-slate-300'}`}>{on && <Check className="w-3 h-3" strokeWidth={3} />}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <p className="mt-4 flex gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 ring-1 ring-amber-200">
              <FlaskConical className="w-4 h-4 shrink-0 text-amber-600" />
              Test mode: the payment is simulated and no money is charged.
            </p>

            <div className="mt-auto pt-5 flex gap-2">
              <Button variant="ghost" onClick={onClose}>Back</Button>
              <Button variant="primary" size="lg" className="flex-1" onClick={pay}>Pay ₹{fare}</Button>
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
};

export default PaymentModal;
