import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Lazy — pulls in esp-web-tools (WebSerial flasher), admins-only page.
const FlashSensorPage = lazy(() => import('./modules/admin/pages/FlashSensorPage'));
import KioskDispatcher from './modules/kiosk/KioskDispatcher';
import KioskSelector from './modules/kiosk/KioskSelector';
import CleanerPage from './modules/cleaner/CleanerPage';
import CleanerLoginPage from './modules/cleaner/CleanerLoginPage';
import AdminLoginPage from './modules/admin/AdminLoginPage';
import AdminLayout from './modules/admin/AdminLayout';
import AdminDashboard from './modules/admin/pages/AdminDashboard';
import AdminDevices from './modules/admin/pages/AdminDevices';
import AdminIncidents from './modules/admin/pages/AdminIncidents';
import AdminAnalytics from './modules/admin/pages/AdminAnalytics';
import AdminCleaners from './modules/admin/pages/AdminCleaners';
import AdminSettings from './modules/admin/pages/AdminSettings';
import AdminKiosk from './modules/admin/pages/AdminKiosk';
import SupervisorLoginPage from './modules/cleaner/SupervisorLoginPage';
import SupervisorPage from './modules/cleaner/SupervisorPage';

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

        {/* Supervisor */}
        <Route path="/supervisor/login" element={<SupervisorLoginPage />} />
        <Route path="/supervisor" element={<SupervisorPage />} />

        {/* Admin dashboard */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="devices" element={<AdminDevices />} />
          <Route path="incidents" element={<AdminIncidents />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="cleaners" element={<AdminCleaners />} />
          <Route path="settings" element={<AdminSettings section="general" />} />
          <Route path="property-settings" element={<AdminSettings section="places" />} />
          <Route path="kiosk" element={<AdminKiosk />} />
        </Route>

        {/* Sensor installer — browser-based ESP32 flashing */}
        <Route
          path="/flash"
          element={
            <Suspense fallback={null}>
              <FlashSensorPage />
            </Suspense>
          }
        />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
