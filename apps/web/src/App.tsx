import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import KioskDispatcher from './modules/kiosk/KioskDispatcher';
import KioskSelector from './modules/kiosk/KioskSelector';
import CleanerPage from './modules/cleaner/CleanerPage';
import CleanerLoginPage from './modules/cleaner/CleanerLoginPage';
import AdminLoginPage from './modules/admin/AdminLoginPage';
import AdminLayout from './modules/admin/AdminLayout';
import AdminDashboard from './modules/admin/pages/AdminDashboard';
import AdminIncidents from './modules/admin/pages/AdminIncidents';
import AdminAnalytics from './modules/admin/pages/AdminAnalytics';
import AdminCleaners from './modules/admin/pages/AdminCleaners';
import AdminSettings from './modules/admin/pages/AdminSettings';
import AdminKiosk from './modules/admin/pages/AdminKiosk';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Kiosk - full screen on tablet */}
        <Route path="/kiosk" element={<KioskSelector />} />
        <Route path="/kiosk/:deviceCode" element={<KioskDispatcher />} />

        {/* Cleaner mobile app */}
        <Route path="/cleaner/login" element={<CleanerLoginPage />} />
        <Route path="/cleaner" element={<CleanerPage />} />

        {/* Admin dashboard */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="incidents" element={<AdminIncidents />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="cleaners" element={<AdminCleaners />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="kiosk" element={<AdminKiosk />} />
        </Route>

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
