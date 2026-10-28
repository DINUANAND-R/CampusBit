import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { conversationsApi } from '../api';
import NotificationCenter from './NotificationCenter';
import {
  Gavel,
  LogOut,
  Plus,
  LayoutDashboard,
  Search,
  MessageSquare,
  Handshake,
  Sparkles,
  Compass,
  ChevronDown,
  Shield,
  User,
  Package,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    const fetchUnread = async () => {
      try {
        const { data } = await conversationsApi.getUnreadCount();
        setUnreadCount(data.unreadCount || 0);
      } catch {}
    };

    fetchUnread();

    if (socket) {
      const handleUpdate = () => fetchUnread();
      socket.on('conversation:update', handleUpdate);
      socket.on('notification:new', handleUpdate);
      return () => {
        socket.off('conversation:update', handleUpdate);
        socket.off('notification:new', handleUpdate);
      };
    }
  }, [user, socket]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/?q=${encodeURIComponent(search.trim())}`);
    }
  };

  return (
    <nav className="sticky top-0 z-50 bg-[#101211]/90 backdrop-blur-md border-b border-[#30372F]">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3 sm:gap-4">
        {/* Logo / Wordmark */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
          <div className="w-8 h-8 rounded-lg bg-[#1B201B] border border-[#30372F] group-hover:border-[#C6FF4D]/50 flex items-center justify-center transition-all">
            <Gavel size={16} className="text-[#C6FF4D]" />
          </div>
          <span className="font-display font-700 text-lg tracking-tight text-[#F4F5F0] hidden sm:block">
            Campus<span className="text-[#C6FF4D]">Bid</span>
          </span>
        </Link>

        {/* Search Field */}
        <form onSubmit={handleSearch} className="flex-1 max-w-sm sm:max-w-md mx-1">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#747D72]"
            />
            <input
              id="nav-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search auctions, products, textbooks…"
              className="w-full bg-[#151815] border border-[#30372F] focus:border-[#C6FF4D] text-[#F4F5F0] placeholder-[#747D72] text-xs sm:text-sm pl-8 pr-3 py-1.5 rounded-lg outline-none transition-all"
            />
          </div>
        </form>

        {/* Center / Navigation Links */}
        <div className="hidden lg:flex items-center gap-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `px-2.5 py-1.5 rounded-lg text-xs font-500 transition-colors flex items-center gap-1.5 ${
                isActive
                  ? 'text-[#C6FF4D] bg-[#1B201B]'
                  : 'text-[#A1A79E] hover:text-[#F4F5F0] hover:bg-[#151815]'
              }`
            }
          >
            <Compass size={14} />
            <span>Explore</span>
          </NavLink>

          <NavLink
            to="/assistant"
            id="nav-assistant-link"
            className={({ isActive }) =>
              `px-2.5 py-1.5 rounded-lg text-xs font-500 transition-colors flex items-center gap-1.5 ${
                isActive
                  ? 'text-[#C6FF4D] bg-[#1B201B]'
                  : 'text-[#A1A79E] hover:text-[#F4F5F0] hover:bg-[#151815]'
              }`
            }
            title="Rule-Based AI Shopping Assistant"
          >
            <Sparkles size={14} className="text-[#C6FF4D]" />
            <span>AI Assistant</span>
          </NavLink>

          {user && (
            <>
              <NavLink
                to="/exchange"
                id="nav-exchange-link"
                className={({ isActive }) =>
                  `px-2.5 py-1.5 rounded-lg text-xs font-500 transition-colors flex items-center gap-1.5 ${
                    isActive
                      ? 'text-[#C6FF4D] bg-[#1B201B]'
                      : 'text-[#A1A79E] hover:text-[#F4F5F0] hover:bg-[#151815]'
                  }`
                }
                title="Product Exchange & Handovers"
              >
                <Handshake size={14} className="text-[#65D99A]" />
                <span>Exchange</span>
              </NavLink>

              <NavLink
                to="/chat"
                id="nav-chat-link"
                className={({ isActive }) =>
                  `relative px-2.5 py-1.5 rounded-lg text-xs font-500 transition-colors flex items-center gap-1.5 ${
                    isActive
                      ? 'text-[#C6FF4D] bg-[#1B201B]'
                      : 'text-[#A1A79E] hover:text-[#F4F5F0] hover:bg-[#151815]'
                  }`
                }
              >
                <MessageSquare size={14} />
                <span>Messages</span>
                {unreadCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-[#C6FF4D] text-[#101211] text-[10px] font-700 flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </NavLink>
            </>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {/* Sell Button */}
          {user && (
            <Link
              to="/listings/new"
              id="nav-sell-btn"
              className="btn btn-primary btn-sm flex items-center gap-1 font-700"
            >
              <Plus size={14} />
              <span>Sell Item</span>
            </Link>
          )}

          {/* Notifications */}
          {user && <NotificationCenter />}

          {/* User Profile Dropdown or Login Buttons */}
          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                id="nav-user-dropdown-btn"
                onClick={() => setDropdownOpen((prev) => !prev)}
                className="flex items-center gap-1.5 p-1 rounded-lg hover:bg-[#1B201B] border border-transparent hover:border-[#30372F] transition-all text-xs"
              >
                <div className="w-7 h-7 rounded-md bg-[#1B201B] border border-[#30372F] text-[#C6FF4D] font-bold text-xs flex items-center justify-center">
                  {user.username?.[0]?.toUpperCase() || 'U'}
                </div>
                <ChevronDown
                  size={13}
                  className={`text-[#747D72] transition-transform duration-150 ${
                    dropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Profile Dropdown Menu */}
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[#151815] border border-[#30372F] shadow-2xl p-2 z-50 text-xs text-[#F4F5F0] animate-in fade-in duration-150">
                  {/* User Info Header */}
                  <div className="px-3 py-2 border-b border-[#30372F] mb-1">
                    <p className="font-600 text-[#F4F5F0] truncate">{user.username}</p>
                    <p className="text-[11px] text-[#747D72] truncate">{user.email}</p>
                    {user.campusId && (
                      <span className="inline-block mt-1 text-[10px] text-[#A1A79E] bg-[#1B201B] px-1.5 py-0.5 rounded border border-[#30372F]">
                        ID: {user.campusId}
                      </span>
                    )}
                  </div>

                  {/* Menu Items */}
                  <div className="space-y-0.5">
                    <Link
                      to="/dashboard"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#1B201B] hover:text-[#C6FF4D] transition-colors"
                    >
                      <LayoutDashboard size={14} />
                      <span>Seller Dashboard</span>
                    </Link>

                    <Link
                      to="/exchange"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#1B201B] hover:text-[#C6FF4D] transition-colors"
                    >
                      <Handshake size={14} className="text-[#65D99A]" />
                      <span>Transactions & Handover</span>
                    </Link>

                    <Link
                      to="/chat"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#1B201B] hover:text-[#C6FF4D] transition-colors"
                    >
                      <MessageSquare size={14} />
                      <span>Campus Chat</span>
                    </Link>

                    {user.role === 'admin' && (
                      <Link
                        to="/admin"
                        id="nav-admin-link"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#1B201B] text-[#FFC857] hover:text-[#FFC857] transition-colors"
                      >
                        <Shield size={14} />
                        <span>Admin Console</span>
                      </Link>
                    )}
                  </div>

                  <div className="border-t border-[#30372F] mt-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        logout();
                        navigate('/');
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[#FF7373] hover:bg-[#FF7373]/10 transition-colors"
                    >
                      <LogOut size={14} />
                      <span>Log Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Link to="/login" className="btn btn-secondary btn-sm py-1.5 px-3">
                Log In
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm py-1.5 px-3 font-700">
                Join Free
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
