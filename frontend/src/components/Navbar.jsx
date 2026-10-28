import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Navigation, BatteryCharging, CalendarCheck, Car, Shield, LogOut, Bell, Menu, X,
  Info, ChevronDown, UserRound, BellOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { notificationApi } from '../services/api';
import { BrandMark, BrandWordmark } from './Brand';

const LINKS = [
  { to: '/dashboard', label: 'Stations', icon: Navigation },
  { to: '/bookings', label: 'Bookings', icon: CalendarCheck },
  { to: '/battery-health', label: 'Battery AI', icon: BatteryCharging },
  { to: '/vehicles', label: 'Vehicles', icon: Car },
];

export { BrandMark } from './Brand';

// Closes a popover on outside click or Escape.
function useDismiss(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen, ref]);
}

const timeAgo = (value) => {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return value || '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(t).toLocaleDateString();
};

const Navbar = () => {
  const { user, logout, login, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isDark = location.pathname === '/' || location.pathname === '/battery-health';

  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const notifRef = useRef(null);
  const trackRef = useRef(null);
  const linkRefs = useRef({});
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const userRef = useRef(null);
  useDismiss(notifOpen, setNotifOpen, notifRef);
  useDismiss(userOpen, setUserOpen, userRef);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Measure the active link so the pill can glide to it (re-measure on resize and when links change).
  useLayoutEffect(() => {
    const measure = () => {
      const path = location.pathname.startsWith('/stations') ? '/dashboard' : location.pathname; // station pages belong to Stations
      const key = Object.keys(linkRefs.current).find((to) => path === to || path.startsWith(`${to}/`));
      const el = key && linkRefs.current[key];
      const track = trackRef.current;
      if (!el || !track) return setPill({ left: 0, width: 0 });
      setPill({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [location.pathname, isAdmin]);

  useEffect(() => {
    setMobileOpen(false);
    setNotifOpen(false);
    setUserOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    notificationApi.getUnreadCount().then((r) => setUnread(r.data.unreadCount || 0)).catch(() => {});
  }, [user]);

  const toggleNotifications = () => {
    const next = !notifOpen;
    setNotifOpen(next);
    setUserOpen(false);
    if (next) {
      notificationApi.getAll().then((r) => setNotifications(r.data || [])).catch(() => setNotifications([]));
    }
  };

  const markAllRead = () => {
    notificationApi.markAllRead().catch(() => {});
    setUnread(0);
    setNotifications((list) => (list || []).map((n) => ({ ...n, read: true, isRead: true })));
  };

  const goAbout = () => {
    setMobileOpen(false);
    if (location.pathname === '/') document.getElementById('about-us')?.scrollIntoView({ behavior: 'smooth' });
    else navigate('/#about-us');
  };

  // Development-only shortcut between the seeded demo accounts.
  const switchDemo = async (role) => {
    try {
      await (role === 'admin' ? login('admin@smartev.com', 'admin123') : login('user@smartev.com', 'user123'));
      navigate(role === 'admin' ? '/admin' : '/dashboard');
    } catch (e) {
      console.error(e);
    }
  };

  const links = isAdmin ? [...LINKS, { to: '/admin', label: 'Admin', icon: Shield }] : LINKS;

  // Island surface per theme; glass blur only on light pages (over the 3D canvas it costs frames).
  const island = isDark
    ? `bg-ink-900/85 ring-1 ring-white/10 text-white ${scrolled ? 'shadow-[0_18px_50px_-20px_rgba(0,0,0,0.9)]' : 'shadow-[0_10px_30px_-18px_rgba(0,0,0,0.8)]'}`
    : `bg-white/80 backdrop-blur-xl backdrop-saturate-150 ring-1 ring-slate-900/[0.06] text-slate-800 ${scrolled ? 'shadow-[0_18px_44px_-22px_rgba(15,23,42,0.45)]' : 'shadow-[0_8px_24px_-18px_rgba(15,23,42,0.35)]'}`;
  const linkBase = 'relative z-10 inline-flex items-center gap-2 px-3.5 h-9 rounded-full text-[13.5px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400';
  const linkIdle = isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900';
  const linkActive = isDark ? 'text-white' : 'text-brand-800';
  const iconBtn = `relative grid place-items-center w-9 h-9 rounded-full transition-colors ${isDark ? 'text-slate-200 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-900/5'}`;

  return (
    <header className="site-nav sticky top-0 z-50 h-16 px-3 sm:px-4 pt-2 pointer-events-none">
      <nav
        aria-label="Main"
        className={`pointer-events-auto mx-auto max-w-7xl h-12 flex items-center gap-2 rounded-full pl-2 pr-1.5 transition-[box-shadow,background-color] duration-300 ${island}`}
      >
        <Link to="/" className="flex items-center gap-2 pr-2 shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400" aria-label="ChargeMate home">
          <BrandMark className="w-8 h-8" />
          <BrandWordmark dark={isDark} />
        </Link>

        {/* Links with a pill that glides to the active page */}
        <div ref={trackRef} className={`relative hidden lg:flex items-center gap-0.5 mx-auto p-1 rounded-full ${isDark ? 'bg-white/[0.04]' : 'bg-slate-900/[0.035]'}`}>
          <span
            aria-hidden="true"
            className={`absolute left-0 top-1 bottom-1 rounded-full transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.65,0,0.35,1)] ${
              isDark ? 'bg-white/10 ring-1 ring-white/10' : 'bg-white ring-1 ring-slate-900/[0.06] shadow-sm'
            }`}
            style={{ width: pill.width, transform: `translateX(${pill.left}px)`, opacity: pill.width ? 1 : 0 }}
          />
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              ref={(el) => { linkRefs.current[to] = el; }}
              className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
          <button onClick={goAbout} className={`${linkBase} ${linkIdle}`}>
            <Info className="w-4 h-4" aria-hidden="true" /> About
          </button>
        </div>

        <div className="ml-auto lg:ml-0 flex items-center gap-1">
          {user && (
            <div className="relative" ref={notifRef}>
              <button onClick={toggleNotifications} className={iconBtn} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={notifOpen}>
                <Bell className="w-[18px] h-[18px]" />
                {unread > 0 && (
                  <span className={`absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10.5px] font-bold leading-4 text-center ring-2 ${isDark ? 'ring-ink-900' : 'ring-white'}`}>
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="popover absolute right-0 mt-3 w-[min(22rem,calc(100vw-2rem))] rounded-2xl bg-white text-slate-800 shadow-2xl ring-1 ring-slate-900/10 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <span className="font-display font-semibold">Notifications</span>
                    {unread > 0 && (
                      <button onClick={markAllRead} className="text-xs font-semibold text-brand-700 hover:text-brand-900">Mark all read</button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto p-2">
                    {notifications === null ? (
                      <div className="py-8 text-center text-sm text-slate-500">Loading…</div>
                    ) : notifications.length === 0 ? (
                      <div className="py-8 flex flex-col items-center gap-2 text-sm text-slate-500">
                        <BellOff className="w-6 h-6 text-slate-400" /> You’re all caught up.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className={`p-3 rounded-xl ${n.read || n.isRead ? '' : 'bg-brand-50/70'}`}>
                          <div className="text-sm font-semibold text-slate-900">{n.title}</div>
                          <div className="text-sm text-slate-600 mt-0.5">{n.message}</div>
                          <div className="text-xs text-slate-500 mt-1">{timeAgo(n.createdAt)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {user ? (
            <div className="relative hidden sm:block" ref={userRef}>
              <button
                onClick={() => { setUserOpen(!userOpen); setNotifOpen(false); }}
                className={`flex items-center gap-1.5 pl-1 pr-2.5 h-9 rounded-full transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-900/5'}`}
                aria-expanded={userOpen}
                aria-label="Account menu"
              >
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-300 to-sky-500 text-ink-950 font-bold text-[13px] grid place-items-center">
                  {(user.name || 'U').trim()[0].toUpperCase()}
                </span>
                <span className="hidden xl:block text-[13.5px] font-semibold max-w-[8rem] truncate">{user.name?.split(' (')[0]}</span>
                <ChevronDown className={`w-4 h-4 opacity-70 transition-transform ${userOpen ? 'rotate-180' : ''}`} />
              </button>
              {userOpen && (
                <div className="popover absolute right-0 mt-3 w-64 rounded-2xl bg-white text-slate-800 shadow-2xl ring-1 ring-slate-900/10 p-2">
                  <div className="px-3 py-2">
                    <div className="text-sm font-semibold text-slate-900 truncate">{user.name}</div>
                    <div className="text-xs text-slate-500 truncate">{user.email}</div>
                    {isAdmin && <span className="mt-2 inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Administrator</span>}
                  </div>
                  <div className="h-px bg-slate-100 my-1" />
                  <Link to="/vehicles" className="menu-item"><Car className="w-4 h-4" /> My vehicles</Link>
                  <Link to="/bookings" className="menu-item"><CalendarCheck className="w-4 h-4" /> My bookings</Link>
                  {isAdmin && <Link to="/admin" className="menu-item"><Shield className="w-4 h-4" /> Admin portal</Link>}
                  {import.meta.env.DEV && (
                    <>
                      <div className="h-px bg-slate-100 my-1" />
                      <div className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Demo accounts (dev only)</div>
                      <div className="flex gap-1 px-2 pb-1">
                        <button onClick={() => switchDemo('driver')} className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200">Driver</button>
                        <button onClick={() => switchDemo('admin')} className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200">Admin</button>
                      </div>
                    </>
                  )}
                  <div className="h-px bg-slate-100 my-1" />
                  <button onClick={() => { logout(); navigate('/'); }} className="menu-item w-full text-rose-600 hover:bg-rose-50">
                    <LogOut className="w-4 h-4" /> Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1">
              <Link to="/login" className={`px-4 h-9 inline-flex items-center rounded-full text-[13.5px] font-semibold transition-colors ${isDark ? 'text-white hover:bg-white/10' : 'text-slate-700 hover:bg-slate-900/5'}`}>
                Log in
              </Link>
              <Link to="/register" className="px-4 h-9 inline-flex items-center rounded-full text-[13.5px] font-bold text-ink-950 bg-gradient-to-r from-brand-300 to-sky-400 hover:brightness-105 shadow-[0_8px_24px_-10px] shadow-brand-400/80 transition">
                Get started
              </Link>
            </div>
          )}

          <button onClick={() => setMobileOpen(!mobileOpen)} className={`${iconBtn} lg:hidden`} aria-label={mobileOpen ? 'Close menu' : 'Open menu'} aria-expanded={mobileOpen}>
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className={`popover pointer-events-auto lg:hidden mx-auto mt-2 max-w-7xl rounded-3xl p-3 ${isDark ? 'bg-ink-900/95 ring-1 ring-white/10 text-white' : 'bg-white ring-1 ring-slate-900/[0.06] text-slate-800'} shadow-2xl`}>
          <div className="grid gap-1">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-2xl text-base font-semibold ${
                  isActive ? (isDark ? 'bg-white/10 text-white' : 'bg-brand-50 text-brand-800') : (isDark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-50')
                }`}
              >
                <Icon className="w-5 h-5" /> {label}
              </NavLink>
            ))}
            <button onClick={goAbout} className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-base font-semibold text-left ${isDark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-50'}`}>
              <Info className="w-5 h-5" /> About
            </button>
          </div>
          <div className={`mt-2 pt-3 border-t ${isDark ? 'border-white/10' : 'border-slate-100'}`}>
            {user ? (
              <div className="flex items-center justify-between gap-3 px-2">
                <div className="flex items-center gap-2 min-w-0">
                  <UserRound className="w-5 h-5 shrink-0" />
                  <span className="text-sm font-semibold truncate">{user.name}</span>
                </div>
                <button onClick={() => { logout(); navigate('/'); }} className="px-3 py-2 rounded-full text-sm font-semibold text-rose-500 hover:bg-rose-500/10">
                  Log out
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link to="/login" className={`py-2.5 rounded-full text-center text-sm font-semibold ${isDark ? 'bg-white/10' : 'bg-slate-100'}`}>Log in</Link>
                <Link to="/register" className="py-2.5 rounded-full text-center text-sm font-bold text-ink-950 bg-gradient-to-r from-brand-300 to-sky-400">Get started</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
