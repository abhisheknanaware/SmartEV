import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AuthLayout, { Field } from '../components/AuthLayout';

const Login = () => {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(searchParams.get('expired') ? 'Your session expired. Please log in again.' : null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(email, password);
      const next = searchParams.get('next');
      if (next && next.startsWith('/') && !next.startsWith('//')) navigate(next);
      else navigate(user.role === 'ROLE_ADMIN' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.response?.status === 401 ? 'That email and password don’t match an account.' : err.response?.data?.message || 'Could not sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Seeded demo accounts exist only in development builds.
  const fillDemo = (role) => {
    setEmail(role === 'admin' ? 'admin@smartev.com' : 'user@smartev.com');
    setPassword(role === 'admin' ? 'admin123' : 'user123');
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to book bays, track sessions and check your battery."
      footer={<>New to ChargeMate? <Link to="/register" className="font-semibold text-brand-700 hover:text-brand-900">Create an account</Link></>}
    >
      <form onSubmit={handleLogin} className="space-y-5" noValidate>
        {error && (
          <div role="alert" className="flex gap-2.5 items-start rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-800">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}
        <Field label="Email" icon={Mail} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <Field label="Password" icon={Lock} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        <button type="submit" disabled={loading} className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-bold text-ink-950 bg-gradient-to-r from-brand-300 to-sky-400 shadow-glow hover:brightness-105 disabled:opacity-60 transition">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          {loading ? 'Signing in…' : 'Log in'}
        </button>

        {import.meta.env.DEV && (
          <div className="rounded-xl border border-dashed border-slate-300 p-3">
            <div className="text-xs font-semibold text-slate-500 mb-2">Demo accounts (development only)</div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => fillDemo('driver')} className="rounded-lg bg-slate-100 hover:bg-slate-200 py-2 text-sm font-semibold text-slate-700">EV driver</button>
              <button type="button" onClick={() => fillDemo('admin')} className="rounded-lg bg-slate-100 hover:bg-slate-200 py-2 text-sm font-semibold text-slate-700">Admin</button>
            </div>
          </div>
        )}
      </form>
    </AuthLayout>
  );
};

export default Login;
