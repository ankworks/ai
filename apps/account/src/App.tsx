import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SettingsShell } from './components/SettingsShell';
import { Preferences } from './pages/Preferences';
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
        <Route element={<SettingsShell />}>
          <Route path="/" element={<P titleKey="acc.overview" phase={2} />} />
          <Route path="/profile" element={<P titleKey="acc.profile" phase={2} />} />
          <Route path="/security" element={<P titleKey="acc.security" phase={2} />} />
          <Route path="/devices" element={<P titleKey="acc.devices" phase={2} />} />
          <Route path="/connected" element={<P titleKey="acc.connected" phase={2} />} />
          <Route path="/plans" element={<P titleKey="acc.plans" phase={2} />} />
          <Route path="/sparks" element={<P titleKey="acc.sparks" phase={3} />} />
          <Route path="/referrals" element={<P titleKey="acc.referrals" phase={6} />} />
          <Route path="/storage" element={<P titleKey="acc.storage" phase={4} />} />
          <Route path="/memory" element={<P titleKey="acc.memory" phase={4} />} />
          <Route path="/preferences" element={<Preferences />} />
          <Route path="/notifications" element={<P titleKey="acc.notifications" phase={7} />} />
          <Route path="/verification" element={<P titleKey="acc.verification" phase={6} />} />
          <Route path="*" element={<P titleKey="acc.overview" phase={2} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
