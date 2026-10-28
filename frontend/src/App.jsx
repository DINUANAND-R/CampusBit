import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Navbar from './components/Navbar';
import BrowsePage          from './pages/Browse/BrowsePage';
import LoginPage           from './pages/Auth/LoginPage';
import RegisterPage        from './pages/Auth/RegisterPage';
import ListingDetailPage   from './pages/Listing/ListingDetailPage';
import CreateListingPage   from './pages/Listing/CreateListingPage';
import EditListingPage     from './pages/Listing/EditListingPage';
import DashboardPage       from './pages/Dashboard/DashboardPage';
import HandoverPage        from './pages/Handover/HandoverPage';
import AdminLayout         from './pages/Admin/AdminLayout';
import AdminOverviewPage   from './pages/Admin/AdminOverviewPage';
import AdminUsersPage      from './pages/Admin/AdminUsersPage';
import AdminListingsPage   from './pages/Admin/AdminListingsPage';
import AdminReportsPage    from './pages/Admin/AdminReportsPage';
import AdminAnalyticsPage  from './pages/Admin/AdminAnalyticsPage';
import CampusChatPage      from './pages/Chat/CampusChatPage';
import './App.css';

// Auth guard
const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
};

const GuestRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" replace /> : children;
};

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
};

function AppRoutes() {
  return (
    <>
      <Navbar />
      <main>
        <Routes>
          <Route path="/"                 element={<BrowsePage />} />
          <Route path="/login"            element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/register"         element={<GuestRoute><RegisterPage /></GuestRoute>} />
          <Route path="/listings/:id"     element={<ListingDetailPage />} />
          <Route path="/listings/:id/edit" element={<PrivateRoute><EditListingPage /></PrivateRoute>} />
          <Route path="/listings/new"     element={<PrivateRoute><CreateListingPage /></PrivateRoute>} />
          <Route path="/dashboard"        element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
          <Route path="/chat"             element={<PrivateRoute><CampusChatPage /></PrivateRoute>} />
          <Route path="/handover/:id"     element={<PrivateRoute><HandoverPage /></PrivateRoute>} />
          
          {/* Protected Admin Routes */}
          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route index element={<AdminOverviewPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="listings" element={<AdminListingsPage />} />
            <Route path="reports" element={<AdminReportsPage />} />
            <Route path="analytics" element={<AdminAnalyticsPage />} />
          </Route>

          <Route path="*"                 element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <AppRoutes />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1a1d30',
                color: '#e2e8f0',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                fontSize: '14px',
              },
              success: { iconTheme: { primary: '#34d399', secondary: '#1a1d30' } },
              error:   { iconTheme: { primary: '#fb7185', secondary: '#1a1d30' } },
            }}
          />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
