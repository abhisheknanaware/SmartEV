import React from 'react';
import { Printer, MapPin, Car, CalendarClock, Zap } from 'lucide-react';
import { Modal, Button, StatusBadge } from './ui';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hhmm = (t) => (t ? String(t).slice(0, 5) : '-');
// The server stores the QR as a full data URL; older records may hold bare base64.
export const qrSrc = (v) => (v?.startsWith('data:') ? v : `data:image/png;base64,${v}`);
const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');

/** Booking receipt built only from what the server stored for this booking. */
const InvoiceModal = ({ isOpen, onClose, booking }) => {
  if (!isOpen || !booking) return null;

  const total = Number(booking.totalAmount || 0);
  // Prices shown at booking include 18% GST; split it out for the receipt.
  const gst = Math.round((total - total / 1.18) * 100) / 100;
  const simulated = !booking.razorpayPaymentId || /^pay_(test|RPZ)/.test(booking.razorpayPaymentId);
  const issued = booking.createdAt ? new Date(booking.createdAt) : null;

  return (
    <Modal open={isOpen} onClose={onClose} title="Booking receipt" size="lg">
      <div id="printable-receipt" className="space-y-6 text-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-display text-2xl font-extrabold text-brand-700">ChargeMate</div>
            <div className="text-xs text-slate-500">EV charging bay booking</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-sm font-semibold text-slate-900">{booking.bookingReference}</div>
            {issued && <div className="text-xs text-slate-500">Booked {issued.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>}
            <div className="mt-1.5"><StatusBadge status={booking.status} /></div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-4 text-sm">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Driver</div>
            <div className="font-semibold text-slate-900">{booking.userName || '-'}</div>
            {booking.userEmail && <div className="text-slate-600">{booking.userEmail}</div>}
            {(booking.vehicleModel || booking.vehicleNumber) && (
              <div className="mt-2 flex items-center gap-1.5 text-slate-700">
                <Car className="w-4 h-4 text-brand-600" /> {booking.vehicleModel}{booking.vehicleNumber && <span className="font-mono text-slate-500">· {booking.vehicleNumber}</span>}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Station</div>
            <div className="font-semibold text-slate-900 flex items-center gap-1.5"><MapPin className="w-4 h-4 text-brand-600 shrink-0" /> {booking.stationName}</div>
            {booking.stationAddress && <div className="text-slate-600">{booking.stationAddress}</div>}
            <div className="mt-2 flex items-center gap-1.5 text-slate-700">
              <CalendarClock className="w-4 h-4 text-brand-600" /> {fmtDate(booking.bookingDate)}, {hhmm(booking.startTime)} – {hhmm(booking.endTime)} · Bay {booking.slotNumber}
            </div>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="py-3">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5"><Zap className="w-4 h-4 text-amber-500" /> Charging bay, {booking.totalHours || 1} hour{(booking.totalHours || 1) > 1 ? 's' : ''}</div>
                <div className="text-xs text-slate-500">
                  {booking.chargerType ? `${booking.chargerType} · ` : ''}parking plus about {booking.chargingKwh || '-'} kWh of energy
                </div>
              </td>
              <td className="py-3 text-right tabular-nums font-semibold">{inr(total)}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex flex-col-reverse sm:flex-row sm:items-end justify-between gap-6">
          <div className="flex items-center gap-4">
            {booking.qrCodeBase64 && (
              <img src={qrSrc(booking.qrCodeBase64)} alt={`Gate pass QR for ${booking.bookingReference}`} className="w-24 h-24 rounded-xl ring-1 ring-slate-200 p-1 bg-white" />
            )}
            <div className="text-sm">
              <div className="font-semibold text-slate-900">Gate pass</div>
              <div className="text-xs text-slate-500">Show this QR at the station to unlock your bay.</div>
              {booking.razorpayPaymentId && <div className="mt-2 text-xs text-slate-500">Payment ID <span className="font-mono">{booking.razorpayPaymentId}</span></div>}
            </div>
          </div>
          <dl className="sm:w-60 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600"><dt>Price before GST</dt><dd className="tabular-nums">{inr(total - gst)}</dd></div>
            <div className="flex justify-between text-slate-600"><dt>GST (18%)</dt><dd className="tabular-nums">{inr(gst)}</dd></div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900"><dt>Total paid</dt><dd className="tabular-nums">{inr(total)}</dd></div>
          </dl>
        </div>

        <p className="text-xs text-slate-500 border-t border-slate-100 pt-4">
          This is a booking receipt, not a GST tax invoice.{simulated ? ' Payments in this build are simulated test payments; no money was charged.' : ''}
        </p>

        <div className="flex justify-end gap-2 print:hidden">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="solid" icon={Printer} onClick={() => window.print()}>Print or save as PDF</Button>
        </div>
      </div>
    </Modal>
  );
};

export default InvoiceModal;
