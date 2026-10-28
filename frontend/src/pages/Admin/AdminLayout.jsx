import React, { useState } from 'react';
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  Package,
  Flag,
  BarChart3,
  Shield,
  ArrowLeft,
  Menu,
  X,
  LogOut,
} from 'lucide-react';

export default function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/users', label: 'User Management', icon: Users },
    { to: '/admin/listings', label: 'Listings & Auctions', icon: Package },
    { to: '/admin/reports', label: 'Reports & Moderation', icon: Flag },
    { to: '/admin/analytics', label: 'Platform Analytics', icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-surface-900 text-slate-100 flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <div className="md:hidden glass border-b border-white/8 p-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center font-bold text-white shadow-md">
            <Shield size={16} />
          </div>
          <span className="font-display font-700 text-lg gradient-text">CampusBid Admin</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-slate-300 hover:text-white"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Sidebar for Desktop & Mobile Overlay */}
      <aside
        className={`fixed md:sticky top-0 z-50 h-screen w-64 glass border-r border-white/8 flex flex-col justify-between p-4 transition-transform duration-200 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex flex-col gap-6">
          {/* Admin Header */}
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center font-bold text-white shadow-lg shadow-amber-500/20">
              <Shield size={20} />
            </div>
            <div>
              <h1 className="font-display font-800 text-base text-slate-100 tracking-tight leading-snug">
                CampusBid
              </h1>
              <span className="badge bg-amber-400/10 text-amber-400 border border-amber-400/20 text-[10px] uppercase font-700 tracking-wider">
                Control Center
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1.5">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-600 transition-all ${
                    isActive
                      ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`
                }
              >
                <Icon size={16} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Bottom User Profile & Back Link */}
        <div className="flex flex-col gap-3 pt-4 border-t border-white/8">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-brand-300 transition-colors px-2 py-1.5"
          >
            <ArrowLeft size={14} /> Back to Seller App
          </Link>

          <div className="flex items-center justify-between p-2 rounded-xl bg-surface-800/60 border border-white/5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center font-700 text-xs text-white shrink-0">
                {user?.username?.[0]?.toUpperCase() || 'A'}
              </div>
              <div className="min-w-0 truncate">
                <p className="font-600 text-xs text-slate-200 truncate">@{user?.username}</p>
                <p className="text-[10px] text-amber-400 uppercase font-700">Super Admin</p>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              title="Logout"
              className="text-slate-400 hover:text-rose-400 p-1 transition-colors"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 p-4 sm:p-8 max-w-7xl mx-auto w-full">
        {children || <Outlet />}
      </div>
    </div>
  );
}
