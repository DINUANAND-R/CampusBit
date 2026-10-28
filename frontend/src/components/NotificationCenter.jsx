import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import {
  Bell,
  Check,
  CheckCheck,
  Tag,
  MessageSquare,
  Clock,
  ExternalLink,
  X,
  Sparkles,
} from 'lucide-react';

const formatTimeAgo = (dateString) => {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diffSecs = Math.floor((now - past) / 1000);

  if (diffSecs < 60) return 'just now';
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return past.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
};

export default function NotificationCenter() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [toast, setToast] = useState(null);
  const [browserAlertsEnabled, setBrowserAlertsEnabled] = useState(
    typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted'
  );

  const containerRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch initial unread count on mount or user change
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      setNotifications([]);
      return;
    }

    const fetchCount = async () => {
      try {
        const { data } = await notificationsApi.getUnreadCount();
        setUnreadCount(data.unreadCount || 0);
      } catch (err) {
        // Fallback: silent
      }
    };

    fetchCount();
  }, [user]);

  // Fetch notifications list
  const fetchNotifications = async (targetPage = 1, append = false) => {
    if (!user) return;
    setLoading(true);
    try {
      const params = {
        page: targetPage,
        limit: 15,
        ...(filter === 'unread' ? { unreadOnly: 'true' } : {}),
      };
      const { data } = await notificationsApi.getAll(params);
      setNotifications((prev) => (append ? [...prev, ...data.notifications] : data.notifications));
      setUnreadCount(data.unreadCount || 0);
      setPage(data.page || 1);
      setHasMore(data.page < data.pages);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch when dropdown opens or filter toggles
  useEffect(() => {
    if (isOpen) {
      fetchNotifications(1, false);
    }
  }, [isOpen, filter]);

  // Handle real-time Socket.IO notifications
  useEffect(() => {
    if (!socket || !user) return;

    const handleNewNotification = (notif) => {
      setUnreadCount((prev) => prev + 1);

      // Prepend to active list if open
      setNotifications((prev) => [
        {
          _id: notif.id || `temp-${Date.now()}`,
          type: notif.type || 'NEW_LISTING',
          title: notif.title || 'New product listed',
          message: notif.message,
          link: notif.link,
          imageUrl: notif.imageUrl,
          startingPrice: notif.startingPrice,
          isRead: false,
          createdAt: notif.createdAt || new Date().toISOString(),
        },
        ...prev,
      ]);

      // Show in-app toast alert
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      setToast(notif);
      toastTimeoutRef.current = setTimeout(() => {
        setToast(null);
      }, 7000);

      // Trigger native browser notification if enabled
      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        window.Notification.permission === 'granted' &&
        document.visibilityState !== 'visible'
      ) {
        try {
          new window.Notification(notif.title || 'CampusBid Alert', {
            body: notif.message,
            icon: notif.imageUrl || '/vite.svg',
          });
        } catch {}
      }
    };

    socket.on('notification:new', handleNewNotification);

    return () => {
      socket.off('notification:new', handleNewNotification);
    };
  }, [socket, user]);

  const handleMarkOneRead = async (e, notif) => {
    e.stopPropagation();
    if (notif.isRead) return;

    try {
      const { data } = await notificationsApi.markRead(notif._id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === notif._id ? { ...n, isRead: true } : n))
      );
      if (typeof data.unreadCount === 'number') {
        setUnreadCount(data.unreadCount);
      } else {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleNotificationClick = (notif) => {
    if (!notif.isRead) {
      handleMarkOneRead({ stopPropagation: () => {} }, notif);
    }
    setIsOpen(false);
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const requestBrowserPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const perm = await window.Notification.requestPermission();
      setBrowserAlertsEnabled(perm === 'granted');
    }
  };

  if (!user) return null;

  return (
    <div className="relative" ref={containerRef}>
      {/* ── Bell Icon Button ────────────────────────────────────────────── */}
      <button
        id="nav-notification-bell"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Notifications"
        className={`btn btn-secondary btn-sm relative p-2 rounded-xl transition-all ${
          isOpen ? 'bg-[#202620] text-white ring-1 ring-[#C6FF4D]/40' : 'text-[#A1A79E] hover:text-[#F4F5F0]'
        }`}
      >
        <Bell size={18} className={unreadCount > 0 ? 'text-[#C6FF4D]' : ''} />
        {unreadCount > 0 && (
          <span
            id="notification-badge"
            className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-[#C6FF4D] text-[#101211] text-[10px] font-bold leading-none min-w-[18px] h-[18px] flex items-center justify-center shadow-md shadow-[#C6FF4D]/30 tabular-nums"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown Panel ──────────────────────────────────────────────── */}
      {isOpen && (
        <div
          id="notification-dropdown"
          className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-1.5rem)] border border-[#30372F] rounded-2xl shadow-2xl bg-[#151815] z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#30372F] flex items-center justify-between bg-[#101211]/50">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#F4F5F0] text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#C6FF4D]/15 text-[#C6FF4D] text-xs font-semibold border border-[#C6FF4D]/30 tabular-nums">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                id="mark-all-notifications-read-btn"
                className="text-xs text-[#C6FF4D] hover:text-[#D6FF7C] flex items-center gap-1 transition-colors font-medium"
              >
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="px-4 py-2 border-b border-[#30372F] flex items-center gap-2 text-xs bg-[#101211]/80">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-lg transition-all ${
                filter === 'all'
                  ? 'bg-[#C6FF4D] text-[#101211] font-bold shadow-sm'
                  : 'text-[#A1A79E] hover:text-[#F4F5F0] hover:bg-[#1B201B]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1 rounded-lg transition-all ${
                filter === 'unread'
                  ? 'bg-[#C6FF4D] text-[#101211] font-bold shadow-sm'
                  : 'text-[#A1A79E] hover:text-[#F4F5F0] hover:bg-[#1B201B]'
              }`}
            >
              Unread only
            </button>

            {!browserAlertsEnabled && typeof window !== 'undefined' && 'Notification' in window && (
              <button
                onClick={requestBrowserPermission}
                className="ml-auto text-[11px] text-amber-400/90 hover:text-amber-300 flex items-center gap-1"
                title="Enable browser alerts when tab is in background"
              >
                <Sparkles size={11} /> Enable alerts
              </button>
            )}
          </div>

          {/* List items */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-white/5 scrollbar-thin">
            {loading && notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-slate-500">
                  <Bell size={20} />
                </div>
                <p className="font-medium text-slate-300">No notifications yet</p>
                <p className="text-[11px] text-slate-500 max-w-[220px]">
                  Whenever a new product is listed or students message you, you'll see alerts here.
                </p>
              </div>
            ) : (
              notifications.map((notif) => {
                const isNewListing = notif.type === 'NEW_LISTING';
                const isWantedMatch = notif.type === 'WANTED_ALERT_MATCH';
                return (
                  <div
                    key={notif._id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-3 transition-colors cursor-pointer flex gap-3 items-start group ${
                      notif.isRead
                        ? 'hover:bg-[#1B201B] opacity-75 hover:opacity-100'
                        : isWantedMatch
                        ? 'bg-[#FFC857]/10 hover:bg-[#FFC857]/15 border-l-2 border-[#FFC857]'
                        : 'bg-[#C6FF4D]/[0.07] hover:bg-[#C6FF4D]/[0.12] border-l-2 border-[#C6FF4D]'
                    }`}
                  >
                    {/* Thumbnail / Icon */}
                    <div className="shrink-0 relative mt-0.5">
                      {notif.imageUrl ? (
                        <img
                          src={notif.imageUrl}
                          alt="Product"
                          className="w-10 h-10 rounded-lg object-cover bg-[#101211] border border-[#30372F]"
                        />
                      ) : (
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                            isWantedMatch
                              ? 'bg-[#FFC857]/10 text-[#FFC857] border-[#FFC857]/30'
                              : isNewListing
                              ? 'bg-[#65D99A]/10 text-[#65D99A] border-[#65D99A]/20'
                              : 'bg-[#C6FF4D]/10 text-[#C6FF4D] border-[#C6FF4D]/20'
                          }`}
                        >
                          {isWantedMatch ? <Sparkles size={18} /> : isNewListing ? <Tag size={18} /> : <MessageSquare size={18} />}
                        </div>
                      )}
                      {!notif.isRead && (
                        <span
                          className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ring-2 ring-[#151815] ${
                            isWantedMatch ? 'bg-[#FFC857]' : 'bg-[#C6FF4D]'
                          }`}
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isWantedMatch && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-[#FFC857]/20 text-[#FFC857] border border-[#FFC857]/30 shrink-0">
                              Wanted Match
                            </span>
                          )}
                          <span className="text-xs font-semibold text-[#F4F5F0] truncate group-hover:text-[#C6FF4D] transition-colors">
                            {notif.title}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#747D72] shrink-0 flex items-center gap-0.5 tabular-nums">
                          <Clock size={10} />
                          {formatTimeAgo(notif.createdAt)}
                        </span>
                      </div>

                      <p className="text-xs text-[#A1A79E] mt-0.5 line-clamp-2 leading-relaxed">
                        {notif.message}
                      </p>

                      <div className="flex items-center gap-2 mt-1.5">
                        {notif.startingPrice !== null && notif.startingPrice !== undefined && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#65D99A]/15 text-[#65D99A] border border-[#65D99A]/30 tabular-nums">
                            Starts at ₹{notif.startingPrice}
                          </span>
                        )}
                        {notif.link && (
                          <span className="text-[10px] text-[#C6FF4D] flex items-center gap-0.5 group-hover:underline">
                            View details <ExternalLink size={10} />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Mark single as read button */}
                    {!notif.isRead && (
                      <button
                        title="Mark as read"
                        onClick={(e) => handleMarkOneRead(e, notif)}
                        className="p-1 rounded-lg text-[#A1A79E] hover:text-[#F4F5F0] hover:bg-[#202620] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Check size={14} />
                      </button>
                    )}
                  </div>
                );
              })
            )}

            {/* Load More */}
            {hasMore && (
              <div className="p-2 text-center bg-[#101211]/30">
                <button
                  onClick={() => fetchNotifications(page + 1, true)}
                  disabled={loading}
                  className="text-xs text-[#C6FF4D] hover:text-[#D6FF7C] py-1 px-3 rounded-lg hover:bg-[#202620] transition-colors font-medium"
                >
                  {loading ? 'Loading...' : 'Load older notifications'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Floating In-App Toast Alert ─────────────────────────────────── */}
      {toast && (
        <div
          id="in-app-notification-toast"
          className="fixed bottom-6 right-6 z-50 max-w-sm w-full border border-[#30372F] rounded-2xl p-4 shadow-2xl bg-[#151815] flex gap-3 items-start animate-in slide-in-from-bottom-5 duration-300"
        >
          {toast.imageUrl ? (
            <img
              src={toast.imageUrl}
              alt="Listing"
              className="w-12 h-12 rounded-xl object-cover bg-[#101211] border border-[#30372F] shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-[#202620] border border-[#30372F] flex items-center justify-center text-[#C6FF4D] shrink-0">
              <Tag size={20} />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span
                className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                  toast.type === 'WANTED_ALERT_MATCH' ? 'text-[#FFC857]' : 'text-[#C6FF4D]'
                }`}
              >
                {toast.type === 'WANTED_ALERT_MATCH' ? (
                  <>
                    <Sparkles size={12} /> Wanted Alert Matched!
                  </>
                ) : (
                  'New Product Listed'
                )}
              </span>
              <button
                onClick={() => setToast(null)}
                className="text-[#747D72] hover:text-[#F4F5F0] p-0.5 rounded transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <p className="text-xs font-semibold text-[#F4F5F0] mt-0.5 truncate">{toast.title}</p>
            <p className="text-xs text-[#A1A79E] mt-0.5 line-clamp-2">{toast.message}</p>

            <div className="flex items-center gap-2 mt-2">
              {toast.startingPrice && (
                <span className="text-xs font-bold text-[#65D99A] tabular-nums">
                  ₹{toast.startingPrice}
                </span>
              )}
              {toast.link && (
                <button
                  onClick={() => {
                    const l = toast.link;
                    setToast(null);
                    navigate(l);
                  }}
                  className="btn btn-primary btn-sm py-1 px-2.5 text-xs ml-auto"
                >
                  View Listing
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
