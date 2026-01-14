import { useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import Navbar from '@/components/Navbar';
import Dashboard from '@/pages/Dashboard';
import CadastroRadios from '@/pages/CadastroRadios';
import Agendamentos from '@/pages/Agendamentos';
import NovoAgendamento from '@/pages/NovoAgendamento';
import AgendamentoRadio from '@/pages/AgendamentoRadio';
import Gravacoes from '@/pages/Gravacoes';
import GravadorManual from '@/pages/GravadorManual';
import Login from '@/pages/Login';
import ProtectedRoute from '@/components/ProtectedRoute';
import GlobalAudioPlayer from '@/components/GlobalAudioPlayer';
import Profile from '@/pages/Profile';
import Tags from '@/pages/Tags';
import SystemStatus from '@/pages/SystemStatus';
import Admin from '@/pages/Admin';

function App() {
  const location = useLocation();
  const isLoginRoute = location.pathname === '/login';
  const [globalAudioTrack, setGlobalAudioTrack] = useState(null);
  const [playerRadio, setPlayerRadio] = useState(null);
  const [playerVolume, setPlayerVolume] = useState(1);

  return (
    <>
      <Helmet>
        <title>Clipradio</title>
        <meta
          name="description"
          content="Sistema avançado de gerenciamento de rádios com gravação automática e agendamento inteligente"
        />
      </Helmet>

      <div className={isLoginRoute ? 'min-h-screen' : 'min-h-screen pb-24'}>
        {!isLoginRoute && <Navbar />}

        <motion.main
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className={isLoginRoute ? 'min-h-screen' : 'pt-32'}
        >
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
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="/status" element={<ProtectedRoute><SystemStatus /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/dashboard" />} />
          </Routes>
        </motion.main>

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
