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
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#101211]">
      {/* Background subtle glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-[#C6FF4D]/[0.04] blur-3xl" />
      </div>

      <div className="bg-[#1B201B] border border-[#30372F] rounded-2xl p-8 w-full max-w-md relative z-10 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#202620] border border-[#30372F] flex items-center justify-center mx-auto mb-4 shadow-sm text-[#C6FF4D]">
            <Gavel size={26} />
          </div>
          <h1 className="font-display font-700 text-2xl text-[#F4F5F0] mb-1">Welcome back</h1>
          <p className="text-[#A1A79E] text-sm">Sign in to your CampusBid account</p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-[#FF7373]/10 border border-[#FF7373]/20 text-[#FF7373] rounded-xl px-4 py-3 mb-6 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-600 text-[#A1A79E] uppercase tracking-wider mb-1.5 block">Email</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#747D72]" />
              <input id="login-email" type="email" value={form.email} onChange={set('email')} required
                className="input pl-9 bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D]" placeholder="you@university.edu" />
            </div>
          </div>

          <div>
            <label className="text-xs font-600 text-[#A1A79E] uppercase tracking-wider mb-1.5 block">Password</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#747D72]" />
              <input id="login-password" type="password" value={form.password} onChange={set('password')} required
                className="input pl-9 bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D]" placeholder="••••••••" />
            </div>
          </div>

          <button id="login-submit" type="submit" disabled={loading} className="btn btn-primary w-full mt-2 py-3">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-[#A1A79E] text-sm mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="text-[#C6FF4D] hover:text-[#D6FF7C] font-600">
            Register free
          </Link>
        </p>
      </div>
    </div>
  );
}
