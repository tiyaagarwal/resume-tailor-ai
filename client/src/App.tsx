import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.tsx';
import HomePage from './pages/HomePage.tsx';
import AnalysisPage from './pages/AnalysisPage.tsx';
import EditorPage from './pages/EditorPage.tsx';
import HistoryPage from './pages/HistoryPage.tsx';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/analysis/:generationId" element={<AnalysisPage />} />
        <Route path="/editor/:generationId" element={<EditorPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </Layout>
  );
}
