import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  Zap, Navigation, BatteryCharging, ShieldCheck, Calendar, Car, ArrowRight,
  MapPin, Sparkles, Star, ChevronDown, QrCode, CreditCard, Route,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePrefersReducedMotion, hasWebGL } from '../hooks/useMotionPrefs';
import { BrandMark, BrandWordmark } from '../components/Brand';

const EvScene = lazy(() => import('../components/three/EvScene'));

const TAGLINES = [
  'Find a charger. Hold the bay. Drive on.',
  'AI route planning across India’s EV corridors.',
  'Battery health you can actually trust.',
];

const PARTNERS = [
  { name: 'Tata Power EZ Charge', power: '24kW - 150kW Dual CCS2', locs: '4,500+ Hubs' },
  { name: 'Jio-bp pulse', power: '60kW - 120kW Fast DC', locs: '1,800+ Hubs' },
  { name: 'Statiq EV Network', power: '30kW - 60kW DC / AC', locs: '2,200+ Hubs' },
  { name: 'Ather Grid', power: 'Fast Grid Hubs', locs: '1,400+ Points' },
  { name: 'ChargeZone', power: 'High-Speed Highway Corridors', locs: '850+ Hubs' },
  { name: 'Zeon Charging', power: '50kW - 120kW CCS2', locs: '600+ Hubs' },
];

const REVIEWS = [
  {
    name: 'Vikramaditya Roy',
    role: 'Tata Nexon EV Max • Mumbai–Pune Expressway',
    comment: 'Reserved a bay at Lonavala, paid in seconds, and my QR pass was ready on arrival. Range anxiety, gone.',
  },
  {
    name: 'Pooja Sundaram',
    role: 'MG ZS EV • Bangalore',
    comment: 'The 10-minute slot hold means no queues, and the battery health estimate matches my OEM app closely.',
  },
  {
    name: 'Rahul K. Sharma',
    role: 'Fleet Manager, 25 XUV400s • Delhi NCR',
    comment: 'The admin dashboard shows booking times, station load and pack trends for the whole fleet in one place.',
  },
];

const SERVICES = [
  { to: '/dashboard', icon: Navigation, title: 'Find Stations & Slots', text: 'Pan-India map with live bay availability, per-kWh tariffs and fast/normal charger filters.', cta: 'Open stations map', accent: 'teal' },
  { to: '/bookings', icon: Calendar, title: 'Bookings & QR Passes', text: 'Reserve bays in advance, track active sessions, download QR passes and receipts.', cta: 'View my bookings', accent: 'sky' },
  { to: '/battery-health', icon: BatteryCharging, title: 'Battery AI Lab', text: 'State-of-health and remaining-life estimates with calibrated uncertainty intervals.', cta: 'Launch battery lab', accent: 'emerald' },
  { to: '/vehicles', icon: Car, title: 'EV Garage', text: 'Manage vehicles, chemistries, connector compatibility and telemetry in one place.', cta: 'Manage vehicles', accent: 'violet' },
];

const STEPS = [
  { icon: Route, title: 'Find a station or route', text: 'Search anywhere in India or browse stations with live slot counters.' },
  { icon: ShieldCheck, title: 'Hold your bay', text: 'Pick a fast DC or AC slot; it is locked for you for 10 minutes.' },
  { icon: CreditCard, title: 'Pay securely', text: 'UPI, card or netbanking through Razorpay, with an instant receipt.' },
  { icon: QrCode, title: 'Scan & plug in', text: 'Show your QR pass at the hub to unlock the charger.' },
];

const ACCENTS = {
  teal: 'text-teal-300 bg-teal-400/10 group-hover:bg-teal-400 group-hover:text-slate-950',
  sky: 'text-sky-300 bg-sky-400/10 group-hover:bg-sky-400 group-hover:text-slate-950',
  emerald: 'text-emerald-300 bg-emerald-400/10 group-hover:bg-emerald-400 group-hover:text-slate-950',
  violet: 'text-violet-300 bg-violet-400/10 group-hover:bg-violet-400 group-hover:text-slate-950',
};

// Maps the viewport centre onto a continuous shot index: shot i is fully framed
// when section i is centred, and the camera interpolates in between.
function useShotProgress(progressRef) {
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const sections = document.querySelectorAll('[data-shot]');
      const mid = window.innerHeight / 2;
      let p = 0;
      sections.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top <= mid && r.bottom > mid) {
          p = Number(el.dataset.shot) + (mid - r.top) / r.height - 0.5;
        } else if (r.bottom <= mid) {
          p = Math.max(p, Number(el.dataset.shot) + 0.5);
        }
      });
      progressRef.current = Math.max(0, p);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [progressRef]);
}

function RotatingTagline({ reducedMotion }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reducedMotion) return undefined;
    const id = setInterval(() => setI((t) => (t + 1) % TAGLINES.length), 4200);
    return () => clearInterval(id);
  }, [reducedMotion]);
  return (
    <p key={i} className="tagline text-base sm:text-lg text-slate-200/90 max-w-xl" aria-live="polite">
      {TAGLINES[i]}
    </p>
  );
}

function SectionHeader({ eyebrow, title, text, align = 'center' }) {
  return (
    <div className={`reveal space-y-4 ${align === 'center' ? 'text-center max-w-3xl mx-auto' : 'max-w-2xl'}`}>
      <span className="inline-block text-[11px] font-bold uppercase tracking-[0.2em] text-teal-300">{eyebrow}</span>
      <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white text-balance">{title}</h2>
      {text && <p className="text-sm sm:text-base text-slate-300/80 leading-relaxed text-pretty">{text}</p>}
    </div>
  );
}

const LandingPage = () => {
  const navigate = useNavigate();
  const progressRef = useRef(0);
  const reducedMotion = usePrefersReducedMotion();
  const [webgl] = useState(() => hasWebGL());
  const [sceneReady, setSceneReady] = useState(false);

  useShotProgress(progressRef);

  const handleSceneReady = useCallback(() => setSceneReady(true), []);

  return (
    <div className="relative w-full text-white">
      {/* Fixed 3D stage behind every section; the camera follows the scroll. */}
      <div className="fixed inset-0 -z-0 pointer-events-none" aria-hidden="true">
        {webgl ? (
          <>
            {/* Gradient stage until the car is loaded, then the 3D scene fades in. */}
            <div className={`absolute inset-0 stage-fallback transition-opacity duration-700 ${sceneReady ? 'opacity-0' : 'opacity-100'}`} />
            <div className={`absolute inset-0 transition-opacity duration-700 ${sceneReady ? 'opacity-100' : 'opacity-0'}`}>
              <Suspense fallback={null}>
                <EvScene progressRef={progressRef} reducedMotion={reducedMotion} onReady={handleSceneReady} />
              </Suspense>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 stage-fallback" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/10 via-transparent to-slate-950/60" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/75 via-slate-950/25 to-transparent" />
      </div>

      <div className="relative z-10">
        {/* 0 — HERO */}
        <section data-shot="0" className="min-h-[calc(100svh-64px)] flex flex-col justify-end px-4 sm:px-10 lg:px-20 pb-16 sm:pb-24">
          <div className="max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-teal-200 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              Intelligent EV charging, navigation & battery health
            </div>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.02] text-balance">
              Charge smarter.<br />
              <span className="text-gradient">Drive further.</span>
            </h1>
            <RotatingTagline reducedMotion={reducedMotion} />
            <div className="flex flex-wrap gap-3 pt-2">
              <button onClick={() => navigate('/dashboard')} className="btn-primary">
                <Zap className="w-4 h-4 fill-current" /> Find stations <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={() => navigate('/battery-health')} className="btn-glass">
                <BatteryCharging className="w-4 h-4" /> Battery AI lab
              </button>
            </div>
          </div>
          <a href="#about-us" className="mt-12 self-start sm:self-center flex flex-col items-center gap-1 text-[11px] uppercase tracking-[0.25em] text-slate-300/80 hover:text-white">
            Scroll to explore <ChevronDown className="w-4 h-4 animate-bounce motion-reduce:animate-none" />
          </a>
        </section>

        {/* 1 — ABOUT (camera drops to the battery pack) */}
        <section id="about-us" data-shot="1" className="min-h-[100svh] flex items-center px-4 sm:px-10 lg:px-20 py-24">
          <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-8">
              <SectionHeader
                align="left"
                eyebrow="About ChargeMate"
                title="Powering India’s clean-mobility shift"
                text="ChargeMate brings charging discovery, concurrency-safe slot reservation and battery-health intelligence into one platform, so drivers spend less time waiting and fleets keep packs healthy for longer."
              />
              <div className="grid grid-cols-2 gap-3 reveal">
                {[
                  ['1,200+', 'Fast charging bays'],
                  ['361', 'Lab cells in the battery benchmark'],
                  ['10 min', 'Guaranteed slot hold'],
                  ['100+', 'Cities & corridors'],
                ].map(([v, l]) => (
                  <div key={l} className="glass rounded-2xl p-4">
                    <div className="text-2xl sm:text-3xl font-black text-gradient">{v}</div>
                    <div className="text-xs text-slate-300 mt-1">{l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="hidden lg:block" />
          </div>
        </section>

        {/* 2 — SERVICES (overhead over the route map) */}
        <section id="services" data-shot="2" className="min-h-[100svh] flex items-center px-4 sm:px-10 lg:px-20 py-24">
          <div className="max-w-7xl mx-auto w-full space-y-12">
            <SectionHeader eyebrow="Services" title="Everything for effortless EV travel" text="Every service is one click away from here or from the navigation bar." />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {SERVICES.map(({ to, icon: Icon, title, text, cta, accent }) => (
                <button
                  key={to}
                  onClick={() => navigate(to)}
                  className="reveal group glass rounded-3xl p-6 text-left flex flex-col justify-between gap-6 transition hover:-translate-y-1 hover:border-teal-300/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
                >
                  <div className="space-y-3">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-colors ${ACCENTS[accent]}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold">{title}</h3>
                    <p className="text-xs text-slate-300/80 leading-relaxed">{text}</p>
                  </div>
                  <span className="flex items-center justify-between text-xs font-bold text-teal-300">
                    {cta} <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 3 — HOW IT WORKS (close on the charger and cable) */}
        <section data-shot="3" className="min-h-[100svh] flex items-center px-4 sm:px-10 lg:px-20 py-24">
          <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-10">
            <div className="space-y-8">
              <SectionHeader align="left" eyebrow="How it works" title="Plugged in within a minute" text="From search to contactless check-in in four steps." />
              <ol className="space-y-3">
                {STEPS.map(({ icon: Icon, title, text }, i) => (
                  <li key={title} className="reveal glass rounded-2xl p-4 flex gap-4 items-start">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-teal-400/15 text-teal-200 flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[11px] font-bold text-teal-300">STEP {String(i + 1).padStart(2, '0')}</div>
                      <div className="font-bold">{title}</div>
                      <p className="text-xs text-slate-300/80 mt-0.5">{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* 4 — PARTNERS & REVIEWS (sweeping pull-back) */}
        <section id="reviews" data-shot="4" className="min-h-[100svh] flex items-center px-4 sm:px-10 lg:px-20 py-24">
          <div className="max-w-7xl mx-auto w-full space-y-14">
            <SectionHeader eyebrow="One network" title="India’s major charging networks, together" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {PARTNERS.map((p) => (
                <div key={p.name} className="reveal glass rounded-2xl p-4 text-center">
                  <div className="font-bold text-xs truncate">{p.name}</div>
                  <div className="text-[11px] text-teal-300 mt-1">{p.power}</div>
                  <div className="text-[11px] text-slate-400">{p.locs}</div>
                </div>
              ))}
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {REVIEWS.map((r) => (
                <figure key={r.name} className="reveal glass rounded-3xl p-6 flex flex-col justify-between gap-5">
                  <div className="space-y-3">
                    <div className="flex text-amber-300" aria-label="5 out of 5 stars">
                      {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="w-4 h-4 fill-current" />)}
                    </div>
                    <blockquote className="text-sm text-slate-200 leading-relaxed">“{r.comment}”</blockquote>
                  </div>
                  <figcaption>
                    <div className="font-bold text-sm">{r.name}</div>
                    <div className="text-[11px] text-teal-300">{r.role}</div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* 5 — CTA */}
        <section data-shot="5" className="min-h-[90svh] flex items-center justify-center px-4 sm:px-10 py-24 text-center">
          <div className="reveal glass-strong rounded-[2rem] p-8 sm:p-14 max-w-3xl space-y-6">
            <div className="w-14 h-14 rounded-2xl bg-teal-400/20 text-teal-200 flex items-center justify-center mx-auto">
              <Zap className="w-7 h-7 fill-current" />
            </div>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-balance">Ready for worry-free EV travel?</h2>
            <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto">
              Locate stations, reserve your slot in real time and keep your battery healthy with predictive AI.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button onClick={() => navigate('/dashboard')} className="btn-primary">
                <MapPin className="w-4 h-4" /> Explore stations <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={() => navigate('/register')} className="btn-glass">Create free account</button>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/10 bg-slate-950/80 backdrop-blur-md py-10 px-4 sm:px-10 lg:px-20 text-xs text-slate-400">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2.5"><BrandMark className="w-7 h-7" glow={false} /><BrandWordmark dark /></div>
              <p className="text-[11px]">EV charging, navigation & battery intelligence</p>
            </div>
            <nav className="flex flex-wrap justify-center gap-5 font-medium" aria-label="Footer">
              {[['/dashboard', 'Find stations'], ['/bookings', 'My bookings'], ['/battery-health', 'Battery AI'], ['/vehicles', 'Vehicles'], ['/admin', 'Admin']].map(([to, label]) => (
                <button key={to} onClick={() => navigate(to)} className="hover:text-white">{label}</button>
              ))}
            </nav>
            <div className="text-[11px] text-center md:text-right">
              <div>© 2026 ChargeMate</div>
              <div className="text-slate-500">
                3D car: <a className="underline hover:text-white" href="https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept" target="_blank" rel="noopener noreferrer">CarConcept</a> by Eric Chadwick, Darmstadt Graphics Group,{' '}
                <a className="underline hover:text-white" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default LandingPage;
