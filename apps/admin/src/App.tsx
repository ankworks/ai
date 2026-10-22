import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useI18n } from '@conai/ui';
import { RequireAdmin } from './components/RequireAdmin';
import { AdminShell } from './components/AdminShell';
import { SignInPage } from './pages/SignIn';
import { DashboardPage } from './pages/Dashboard';
import { UsersPage } from './pages/Users';
import { AdminsPage } from './pages/Admins';
import { AuditPage } from './pages/Audit';
import { SettingsPage } from './pages/Settings';
import { ModulePlaceholder } from './pages/ModulePlaceholder';

/** The 11 planned modules not yet implemented — honest placeholders, no fake controls. */
function PlannedModule({ titleKey }: { titleKey: Parameters<ReturnType<typeof useI18n>['t']>[0] }) {
  const { t } = useI18n();
  return <ModulePlaceholder title={t(titleKey)} />;
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/signin" element={<SignInPage />} />

        <Route element={<RequireAdmin />}>
          <Route element={<AdminShell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/admins" element={<AdminsPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/settings" element={<SettingsPage />} />

            {/* Planned Phase 6 modules — placeholders until their slices land. */}
            <Route
              path="/verification"
              element={<PlannedModule titleKey="admin.placeholder.title" />}
            />
            <Route path="/teams" element={<PlannedModule titleKey="admin.placeholder.title" />} />
            <Route
              path="/providers"
              element={<PlannedModule titleKey="admin.placeholder.title" />}
            />
            <Route path="/models" element={<PlannedModule titleKey="admin.placeholder.title" />} />
            <Route
              path="/credentials"
              element={<PlannedModule titleKey="admin.placeholder.title" />}
            />
            <Route path="/sparks" element={<PlannedModule titleKey="admin.placeholder.title" />} />
            <Route
              path="/referrals"
              element={<PlannedModule titleKey="admin.placeholder.title" />}
            />
            <Route path="/storage" element={<PlannedModule titleKey="admin.placeholder.title" />} />
            <Route
              path="/governance"
              element={<PlannedModule titleKey="admin.placeholder.title" />}
            />
            <Route path="/trust" element={<PlannedModule titleKey="admin.placeholder.title" />} />
            <Route path="/reports" element={<PlannedModule titleKey="admin.placeholder.title" />} />
            <Route
              path="/maintenance"
              element={<PlannedModule titleKey="admin.placeholder.title" />}
            />
            <Route
              path="/notifications"
              element={<PlannedModule titleKey="admin.placeholder.title" />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
