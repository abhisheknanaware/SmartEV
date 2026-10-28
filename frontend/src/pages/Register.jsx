import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Phone, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AuthLayout, { Field } from '../components/AuthLayout';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Use at least 6 characters for your password.');
      return;
    }
    setLoading(true);
    try {
      // Accounts created here are always regular drivers; admins are provisioned separately.
      await register(name, email, password, phone, 'ROLE_USER');
      navigate('/dashboard');
    } catch (err) {
      const data = err.response?.data;
      let msg = 'Registration failed. Please try again.';
      if (data?.details) msg = typeof data.details === 'string' ? data.details : Object.values(data.details).join('. ');
      else if (data?.message) msg = data.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free for drivers. Takes under a minute."
      footer={<>Already have an account? <Link to="/login" className="font-semibold text-brand-700 hover:text-brand-900">Log in</Link></>}
    >
      <form onSubmit={handleRegister} className="space-y-5" noValidate>
        {error && (
          <div role="alert" className="flex gap-2.5 items-start rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-800">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}
        <Field label="Full name" icon={User} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Rohit Sharma" />
        <Field label="Email" icon={Mail} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <Field label="Phone" icon={Phone} type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" hint="Used for booking alerts. Optional." />
        <Field label="Password" icon={Lock} type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
        <button type="submit" disabled={loading} className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-bold text-ink-950 bg-gradient-to-r from-brand-300 to-sky-400 shadow-glow hover:brightness-105 disabled:opacity-60 transition">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          {loading ? 'Creating account…' : 'Create account'}
        </button>
        <p className="text-xs text-slate-500 text-center">By creating an account you agree to fair use of charging bays and timely cancellation.</p>
      </form>
    </AuthLayout>
  );
};

export default Register;
