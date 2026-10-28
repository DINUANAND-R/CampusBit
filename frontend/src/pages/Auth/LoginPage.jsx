import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Gavel, Mail, Lock, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
      toast.success('Welcome back!');
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-brand-600/20 blur-3xl" />
      </div>

      <div className="glass rounded-2xl p-8 w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand-500/40">
            <Gavel size={26} className="text-white" />
          </div>
          <h1 className="font-display font-700 text-2xl text-slate-100 mb-1">Welcome back</h1>
          <p className="text-slate-400 text-sm">Sign in to your CampusBid account</p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl px-4 py-3 mb-6 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-600 text-slate-300 uppercase tracking-wider mb-1.5 block">Email</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="login-email" type="email" value={form.email} onChange={set('email')} required
                className="input pl-9" placeholder="you@university.edu" />
            </div>
          </div>

          <div>
            <label className="text-xs font-600 text-slate-300 uppercase tracking-wider mb-1.5 block">Password</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="login-password" type="password" value={form.password} onChange={set('password')} required
                className="input pl-9" placeholder="••••••••" />
            </div>
          </div>

          <button id="login-submit" type="submit" disabled={loading} className="btn btn-primary w-full mt-2 py-3">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-slate-400 text-sm mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="text-brand-400 hover:text-brand-300 font-600">
            Register free
          </Link>
        </p>
      </div>
    </div>
  );
}
