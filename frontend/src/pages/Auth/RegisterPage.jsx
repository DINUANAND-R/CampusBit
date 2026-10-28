import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Gavel, Mail, Lock, User, Hash, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '', campusId: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      await register(form.username, form.email, form.password, form.campusId);
      toast.success('Account created! Welcome to CampusBid 🎉');
      navigate('/');
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.errors?.[0]?.msg || 'Registration failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/4 w-80 h-80 rounded-full bg-purple-600/15 blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-64 h-64 rounded-full bg-brand-600/15 blur-3xl" />
      </div>

      <div className="glass rounded-2xl p-8 w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand-500/40">
            <Gavel size={26} className="text-white" />
          </div>
          <h1 className="font-display font-700 text-2xl text-slate-100 mb-1">Join CampusBid</h1>
          <p className="text-slate-400 text-sm">Buy and sell with your campus community</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl px-4 py-3 mb-5 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-600 text-slate-300 uppercase tracking-wider mb-1.5 block">Username</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input id="reg-username" type="text" value={form.username} onChange={set('username')} required minLength={3}
                  className="input pl-9 text-sm" placeholder="john_doe" />
              </div>
            </div>
            <div>
              <label className="text-xs font-600 text-slate-300 uppercase tracking-wider mb-1.5 block">Campus ID</label>
              <div className="relative">
                <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input id="reg-campus-id" type="text" value={form.campusId} onChange={set('campusId')}
                  className="input pl-9 text-sm" placeholder="Optional" />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-600 text-slate-300 uppercase tracking-wider mb-1.5 block">Email</label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="reg-email" type="email" value={form.email} onChange={set('email')} required
                className="input pl-9 text-sm" placeholder="you@university.edu" />
            </div>
          </div>

          <div>
            <label className="text-xs font-600 text-slate-300 uppercase tracking-wider mb-1.5 block">Password</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="reg-password" type="password" value={form.password} onChange={set('password')} required minLength={6}
                className="input pl-9 text-sm" placeholder="Min 6 characters" />
            </div>
          </div>

          <button id="reg-submit" type="submit" disabled={loading} className="btn btn-primary w-full mt-2 py-3">
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-slate-400 text-sm mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-400 hover:text-brand-300 font-600">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
