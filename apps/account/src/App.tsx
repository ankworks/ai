import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SettingsShell } from './components/SettingsShell';
import { RequireAuth } from './components/RequireAuth';
import { SignInPage } from './pages/auth/SignIn';
import { SignUpPage } from './pages/auth/SignUp';
import { SetupPage } from './pages/auth/Setup';
import { ResetPasswordPage } from './pages/auth/Reset';
import { OverviewPage } from './pages/Overview';
import { ProfilePage } from './pages/Profile';
import { SecurityPage } from './pages/Security';
import { DevicesPage } from './pages/Devices';
import { ConnectedPage } from './pages/Connected';
import { PlansPage } from './pages/Plans';
import { SparksPage } from './pages/Sparks';
import { Preferences } from './pages/Preferences';
import { MemoryPage } from './pages/Memory';
import { StoragePage } from './pages/Storage';
import { Placeholder } from './pages/Placeholder';
import { useI18n } from '@conai/ui';

function P({
  titleKey,
  phase,
}: {
  titleKey: Parameters<ReturnType<typeof useI18n>['t']>[0];
  phase: number;
}) {
  const { t } = useI18n();
  return <Placeholder title={t(titleKey)} phase={phase} />;
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        {/* Public auth flow */}
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Signed-in account */}
        <Route element={<RequireAuth />}>
          <Route path="/setup" element={<SetupPage />} />
          <Route element={<SettingsShell />}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/security" element={<SecurityPage />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/connected" element={<ConnectedPage />} />
            <Route path="/plans" element={<PlansPage />} />
            <Route path="/sparks" element={<SparksPage />} />
            <Route path="/referrals" element={<P titleKey="acc.referrals" phase={6} />} />
            <Route path="/storage" element={<StoragePage />} />
            <Route path="/memory" element={<MemoryPage />} />
            <Route path="/preferences" element={<Preferences />} />
            <Route path="/notifications" element={<P titleKey="acc.notifications" phase={7} />} />
            <Route path="/verification" element={<P titleKey="acc.verification" phase={6} />} />
            <Route path="*" element={<OverviewPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
