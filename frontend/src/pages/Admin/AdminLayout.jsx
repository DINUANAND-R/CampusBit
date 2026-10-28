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
    <div className="min-h-screen bg-[#101211] text-[#F4F5F0] flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <div className="md:hidden bg-[#151815] border-b border-[#30372F] p-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#202620] border border-[#30372F] flex items-center justify-center font-bold text-[#C6FF4D]">
            <Shield size={16} />
          </div>
          <span className="font-display font-700 text-lg text-[#F4F5F0]">CampusBid Admin</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-[#A1A79E] hover:text-[#F4F5F0]"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Sidebar for Desktop & Mobile Overlay */}
      <aside
        className={`fixed md:sticky top-0 z-50 h-screen w-64 bg-[#151815] border-r border-[#30372F] flex flex-col justify-between p-4 transition-transform duration-200 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex flex-col gap-6">
          {/* Admin Header */}
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-10 h-10 rounded-xl bg-[#202620] border border-[#30372F] flex items-center justify-center font-bold text-[#C6FF4D] shadow-sm">
              <Shield size={20} />
            </div>
            <div>
              <h1 className="font-display font-800 text-base text-[#F4F5F0] tracking-tight leading-snug">
                CampusBid
              </h1>
              <span className="badge bg-[#C6FF4D]/10 text-[#C6FF4D] border border-[#C6FF4D]/30 text-[10px] uppercase font-700 tracking-wider">
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
                      ? 'bg-[#C6FF4D] text-[#101211] font-bold shadow-sm shadow-[#C6FF4D]/20'
                      : 'text-[#A1A79E] hover:text-[#F4F5F0] hover:bg-[#1B201B]'
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
        <div className="flex flex-col gap-3 pt-4 border-t border-[#30372F]">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 text-xs text-[#A1A79E] hover:text-[#C6FF4D] transition-colors px-2 py-1.5"
          >
            <ArrowLeft size={14} /> Back to Seller App
          </Link>

          <div className="flex items-center justify-between p-2 rounded-xl bg-[#1B201B] border border-[#30372F]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#202620] border border-[#30372F] flex items-center justify-center font-700 text-xs text-[#C6FF4D] shrink-0">
                {user?.username?.[0]?.toUpperCase() || 'A'}
              </div>
              <div className="min-w-0 truncate">
                <p className="font-600 text-xs text-[#F4F5F0] truncate">@{user?.username}</p>
                <p className="text-[10px] text-[#C6FF4D] uppercase font-700">Super Admin</p>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              title="Logout"
              className="text-[#747D72] hover:text-[#FF7373] p-1 transition-colors"
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
