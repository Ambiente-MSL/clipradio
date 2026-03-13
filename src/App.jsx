import { lazy, Suspense, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import Navbar from '@/components/Navbar';
import ProtectedRoute from '@/components/ProtectedRoute';
import GlobalAudioPlayer from '@/components/GlobalAudioPlayer';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const CadastroRadios = lazy(() => import('@/pages/CadastroRadios'));
const Agendamentos = lazy(() => import('@/pages/Agendamentos'));
const NovoAgendamento = lazy(() => import('@/pages/NovoAgendamento'));
const AgendamentoRadio = lazy(() => import('@/pages/AgendamentoRadio'));
const Gravacoes = lazy(() => import('@/pages/Gravacoes'));
const GravadorManual = lazy(() => import('@/pages/GravadorManual'));
const Login = lazy(() => import('@/pages/Login'));
const Profile = lazy(() => import('@/pages/Profile'));
const Tags = lazy(() => import('@/pages/Tags'));
const NuvemPalavras = lazy(() => import('@/pages/NuvemPalavras'));
const SystemStatus = lazy(() => import('@/pages/SystemStatus'));
const Admin = lazy(() => import('@/pages/Admin'));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-cyan-500" />
  </div>
);

function App() {
  const location = useLocation();
  const isLoginRoute = location.pathname === '/login';
  const [globalAudioTrack, setGlobalAudioTrack] = useState(null);

  return (
    <>
      <Helmet>
        <title>Clipradio | MSL Estratégia</title>
        <meta
          name="description"
          content="Sistema avançado de gerenciamento de rádios com gravação automática e agendamento inteligente"
        />
      </Helmet>

      <div className={isLoginRoute ? 'min-h-screen' : 'min-h-screen pb-24'}>
        {!isLoginRoute && <Navbar />}

        <main className={`page-fade-in ${isLoginRoute ? 'min-h-screen' : 'pt-32'}`}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Navigate to="/dashboard" />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/cadastro-radios" element={<ProtectedRoute><CadastroRadios /></ProtectedRoute>} />
              <Route path="/agendamentos" element={<ProtectedRoute><Agendamentos /></ProtectedRoute>} />
              <Route path="/novo-agendamento" element={<ProtectedRoute><NovoAgendamento /></ProtectedRoute>} />
              <Route path="/agendamento/:agendamentoId" element={<ProtectedRoute><AgendamentoRadio /></ProtectedRoute>} />
              <Route path="/gravacoes" element={<ProtectedRoute><Gravacoes setGlobalAudioTrack={setGlobalAudioTrack} /></ProtectedRoute>} />
              <Route path="/gravador-manual" element={<ProtectedRoute><GravadorManual /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/tags" element={<ProtectedRoute><Tags /></ProtectedRoute>} />
              <Route path="/nuvem-palavras" element={<ProtectedRoute><NuvemPalavras /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
              <Route path="/status" element={<ProtectedRoute><SystemStatus /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/dashboard" />} />
            </Routes>
          </Suspense>
        </main>

        <GlobalAudioPlayer
          track={globalAudioTrack}
          onClose={() => {
            setGlobalAudioTrack(null);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('global-audio-closed'));
            }
          }}
        />
      </div>
    </>
  );
}

export default App;
