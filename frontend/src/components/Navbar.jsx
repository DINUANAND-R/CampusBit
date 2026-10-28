import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { conversationsApi } from '../api';
import { Gavel, LogOut, Plus, LayoutDashboard, Search, MessageSquare } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

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
    if (search.trim()) navigate(`/?q=${encodeURIComponent(search.trim())}`);
  };

  return (
    <nav className="sticky top-0 z-50 glass border-b border-white/8">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <Gavel size={18} className="text-white" />
          </div>
          <span className="font-display font-700 text-xl gradient-text hidden sm:block">
            CampusBid
          </span>
        </Link>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex-1 max-w-md">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="nav-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search auctions…"
              className="input pl-9 py-2 text-sm"
            />
          </div>
        </form>

        {/* Actions */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {user ? (
            <>
              <Link to="/listings/new" className="btn btn-primary btn-sm">
                <Plus size={15} /> Sell
              </Link>
              <Link to="/dashboard" className="btn btn-secondary btn-sm">
                <LayoutDashboard size={15} />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
              <Link to="/chat" id="nav-chat-link" className="btn btn-secondary btn-sm relative flex items-center gap-1.5">
                <MessageSquare size={15} className="text-brand-400" />
                <span className="hidden sm:inline">Campus Chat</span>
                {unreadCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </Link>
              {user.role === 'admin' && (
                <Link
                  to="/admin"
                  id="nav-admin-link"
                  className="btn btn-secondary btn-sm border-amber-400/40 text-amber-300 hover:bg-amber-500/10"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span>Admin</span>
                </Link>
              )}
              <button onClick={() => { logout(); navigate('/'); }} className="btn btn-secondary btn-sm">
                <LogOut size={15} />
              </button>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center text-xs font-700 text-white shrink-0">
                {user.username[0].toUpperCase()}
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-secondary btn-sm">Login</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Join Free</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
