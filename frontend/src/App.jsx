import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import AiChatModal from './components/AiChatModal';
import ErrorBoundary from './components/ErrorBoundary';
import { usePrefersReducedMotion } from './hooks/useMotionPrefs';

// Route code is split per page; each loader is reused to preload before a transition.
const loaders = {
  '/': () => import('./pages/LandingPage'),
  '/dashboard': () => import('./pages/Dashboard'),
  '/stations': () => import('./pages/StationDetails'),
  '/battery-health': () => import('./pages/BatteryDashboard'),
  '/bookings': () => import('./pages/BookingsPage'),
  '/vehicles': () => import('./pages/VehiclesPage'),
  '/admin': () => import('./pages/AdminDashboard'),
  '/login': () => import('./pages/Login'),
  '/register': () => import('./pages/Register'),
};

const LandingPage = lazy(loaders['/']);
const Dashboard = lazy(loaders['/dashboard']);
const StationDetails = lazy(loaders['/stations']);
const BatteryDashboard = lazy(loaders['/battery-health']);
const BookingsPage = lazy(loaders['/bookings']);
const VehiclesPage = lazy(loaders['/vehicles']);
const AdminDashboard = lazy(loaders['/admin']);
const Login = lazy(loaders['/login']);
const Register = lazy(loaders['/register']);

// Depth of each route in the journey: moving deeper dollies the camera in, moving back pulls out.
const DEPTH = { '/': 0, '/login': 1, '/register': 1, '/dashboard': 1, '/battery-health': 1, '/vehicles': 2, '/bookings': 2, '/admin': 2, '/stations': 3 };

const routeKey = (pathname) => '/' + (pathname.split('/')[1] || '');
const preload = (pathname) => (loaders[routeKey(pathname)] || loaders['/'])().catch(() => {});

// Pages that need a login send visitors to /login and bring them back afterwards.
function RequireAuth({ children, admin = false }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <PageFallback />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (admin && !isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

function PageFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-label="Loading page">
      <div className="w-10 h-10 rounded-full border-2 border-teal-400/30 border-t-teal-400 animate-spin" />
    </div>
  );
}

// Holds the location that is actually rendered and swaps it inside a view transition,
// so every navigation (links, navigate() calls, back/forward) gets the camera move.
function useCameraTransition() {
  const location = useLocation();
  const [shown, setShown] = useState(location);
  const reducedMotion = usePrefersReducedMotion();
  const mainRef = useRef(null);
  const pending = useRef(0);

  useEffect(() => {
    if (location.pathname === shown.pathname && location.search === shown.search) {
      if (location.key !== shown.key) setShown(location);
      return;
    }
    const ticket = ++pending.current;
    const root = document.documentElement;
    const from = DEPTH[routeKey(shown.pathname)] ?? 1;
    const to = DEPTH[routeKey(location.pathname)] ?? 1;

    // Render the new page synchronously, then position the scroll (hash target or top).
    const commit = () => {
      flushSync(() => setShown(location));
      const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) target.scrollIntoView();
      else window.scrollTo(0, 0);
    };
    const focusMain = () => mainRef.current?.focus({ preventScroll: true });

    preload(location.pathname).then(() => {
      if (ticket !== pending.current) return; // a newer navigation superseded this one
      if (!document.startViewTransition || reducedMotion) {
        commit();
        requestAnimationFrame(focusMain);
        return;
      }
      root.dataset.navDir = to >= from ? 'forward' : 'back';
      const vt = document.startViewTransition(commit);
      vt.ready.catch(() => {}); // skipped transitions (e.g. hidden tab) reject; the DOM still updates
      vt.finished.finally(() => {
        delete root.dataset.navDir;
        focusMain();
      });
    });
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  return { shown, mainRef };
}

function AppContent() {
  const { shown, mainRef } = useCameraTransition();
  const isHomePage = shown.pathname === '/';
  const isBatteryPage = shown.pathname === '/battery-health';
  const isDarkPage = isHomePage || isBatteryPage;

  return (
    <div className={`min-h-screen flex flex-col font-sans ${isDarkPage ? 'bg-slate-950 text-slate-100' : 'app-light text-slate-800'}`}>
      <Navbar />

      <main ref={mainRef} tabIndex={-1} className="page-stage flex-1 relative outline-none">
        <ErrorBoundary resetKey={shown.pathname}>
        <Suspense fallback={<PageFallback />}>
          <Routes location={shown}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/stations/:id" element={<StationDetails />} />
            <Route path="/battery-health" element={<BatteryDashboard />} />
            <Route path="/bookings" element={<RequireAuth><BookingsPage /></RequireAuth>} />
            <Route path="/vehicles" element={<RequireAuth><VehiclesPage /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth admin><AdminDashboard /></RequireAuth>} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </main>

      <AiChatModal />

      {!isDarkPage && (
        <footer className="border-t border-slate-200/80 bg-white/70 backdrop-blur py-6 text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div><span className="font-bold text-slate-800">ChargeMate</span> • EV navigation, charging & battery health</div>
            <div className="text-[11px]">Pan-India EV charging network</div>
          </div>
        </footer>
      )}

      {isBatteryPage && (
        <footer className="border-t border-slate-800/80 bg-slate-950 py-6 text-xs text-slate-400">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div><span className="font-bold text-white">SmartEV Battery AI Lab</span> • LightGBM SOH models with conformal intervals</div>
            <div className="text-[11px] text-slate-500">Offline evaluation on public laboratory datasets</div>
          </div>
        </footer>
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;
