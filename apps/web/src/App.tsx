import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home';
import { Trust } from './pages/Trust';

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/trust" element={<Trust />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
