import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Home } from './pages/Home';
import { PhasePage } from './pages/PhasePage';

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/chat" element={<PhasePage titleKey="ws.chat" phase={3} />} />
          <Route path="/study" element={<PhasePage titleKey="ws.study" phase={4} />} />
          <Route path="/coding" element={<PhasePage titleKey="ws.coding" phase={4} />} />
          <Route path="/writing" element={<PhasePage titleKey="ws.writing" phase={4} />} />
          <Route path="/documents" element={<PhasePage titleKey="ws.documents" phase={4} />} />
          <Route path="/tools" element={<PhasePage titleKey="ws.tools" phase={4} />} />
          <Route path="/library" element={<PhasePage titleKey="ws.library" phase={4} />} />
          <Route path="/history" element={<PhasePage titleKey="ws.history" phase={3} />} />
          <Route path="/teams" element={<PhasePage titleKey="ws.teams" phase={5} />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
