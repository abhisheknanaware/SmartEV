import React from 'react';
import { BatteryCharging, MapPinned, ShieldCheck } from 'lucide-react';
import { BrandMark, BrandWordmark } from './Brand';

const POINTS = [
  { icon: MapPinned, title: 'Every charger, one map', text: 'Live bay availability and tariffs across India’s networks.' },
  { icon: ShieldCheck, title: 'Your bay, guaranteed', text: 'A 10-minute hold while you pay, with no double bookings.' },
  { icon: BatteryCharging, title: 'Battery health with honest ranges', text: 'SOH estimates come with calibrated uncertainty.' },
];

export function Field({ label, icon: Icon, hint, ...props }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</span>
      <span className="relative block">
        {Icon && <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />}
        <input
          {...props}
          className={`w-full rounded-xl border border-slate-300 bg-white py-3 ${Icon ? 'pl-10' : 'pl-3.5'} pr-3.5 text-[15px] text-slate-900 placeholder:text-slate-400`}
        />
      </span>
      {hint && <span className="block text-xs text-slate-500 mt-1.5">{hint}</span>}
    </label>
  );
}

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-[calc(100svh-64px)] grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-ink-950 text-white p-12 xl:p-16">
        <div className="absolute inset-0 stage-fallback opacity-90" aria-hidden="true" />
        <div className="absolute -right-24 top-1/3 w-[28rem] h-[28rem] rounded-full bg-brand-400/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <BrandMark className="w-10 h-10" />
          <BrandWordmark dark className="text-xl" />
        </div>
        <div className="relative space-y-10 max-w-md">
          <h2 className="text-4xl xl:text-5xl font-extrabold leading-[1.05]">
            Charging that <span className="text-gradient">fits your trip</span>, not the other way round.
          </h2>
          <ul className="space-y-5">
            {POINTS.map(({ icon: Icon, title: t, text }) => (
              <li key={t} className="flex gap-4">
                <span className="shrink-0 w-10 h-10 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center text-brand-300">
                  <Icon className="w-5 h-5" />
                </span>
                <span>
                  <span className="block font-semibold">{t}</span>
                  <span className="block text-sm text-slate-300">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-400">© 2026 ChargeMate · SmartEV platform</p>
      </aside>

      <section className="flex items-center justify-center px-4 sm:px-8 py-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex justify-center mb-6"><BrandMark className="w-12 h-12" /></div>
          <h1 className="text-3xl font-extrabold text-slate-900 text-center lg:text-left">{title}</h1>
          {subtitle && <p className="mt-2 text-slate-600 text-center lg:text-left">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-sm text-slate-600 text-center">{footer}</div>}
        </div>
      </section>
    </div>
  );
}
