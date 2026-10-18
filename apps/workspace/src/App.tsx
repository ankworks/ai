import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Home } from './pages/Home';
import { Chat } from './pages/Chat';
import { HistoryPage } from './pages/History';
import { LibraryPage } from './pages/Library';
import { PhasePage } from './pages/PhasePage';
import { ToolsPage } from './pages/Tools';

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/chat" element={<Chat />} />
          {/* Phase 4 — one Tools gallery, presets open Chat with ?tool=<id> */}
          <Route path="/study" element={<ToolsPage />} />
          <Route path="/coding" element={<ToolsPage />} />
          <Route path="/writing" element={<ToolsPage />} />
          <Route path="/documents" element={<ToolsPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/teams" element={<PhasePage titleKey="ws.teams" phase={5} />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
