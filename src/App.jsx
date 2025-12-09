
    import { useState } from 'react';
    import { Routes, Route, Navigate } from 'react-router-dom';
    import { Helmet } from 'react-helmet';
    import { motion } from 'framer-motion';
    import Navbar from '@/components/Navbar';
    import Dashboard from '@/pages/Dashboard';
    import Painel from '@/pages/Painel';
    import CadastroRadios from '@/pages/CadastroRadios';
    import Agendamentos from '@/pages/Agendamentos';
    import NovoAgendamento from '@/pages/NovoAgendamento';
    import Gravacoes from '@/pages/Gravacoes';
    import GravadorManual from '@/pages/GravadorManual';
    import EdicaoIA from '@/pages/EdicaoIA';
    import EdicaoIALanding from '@/pages/EdicaoIALanding';
    import Login from '@/pages/Login';
    import Cadastro from '@/pages/Cadastro';
    import ProtectedRoute from '@/components/ProtectedRoute';
    import GlobalAudioPlayer from '@/components/GlobalAudioPlayer';
    import Profile from '@/pages/Profile';
    import Tags from '@/pages/Tags';
    import AgendamentoRadio from '@/pages/AgendamentoRadio';
    import Historico from '@/pages/Historico';
    import GravacaoEmMassa from '@/pages/GravacaoEmMassa';
    import AudioPlayer from '@/components/AudioPlayer';
    import Lista from '@/pages/Lista';
    import SystemStatus from '@/pages/SystemStatus';
    
    function App() {
      const [globalAudioTrack, setGlobalAudioTrack] = useState(null);
      const [playerRadio, setPlayerRadio] = useState(null);
      const [playerVolume, setPlayerVolume] = useState(1);
    
      return (
        <>
          <Helmet>
            <title>Gestor de Rádios - IA Recorder</title>
            <meta name="description" content="Sistema avançado de gerenciamento de rádios com gravação automática por IA e agendamento inteligente" />
          </Helmet>
          
          <div className="min-h-screen pb-24">
            <Navbar />
            
            <motion.main
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="pt-32"
            >
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/cadastro-usuario" element={<Cadastro />} />
                <Route path="/" element={<Navigate to="/dashboard" />} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/painel" element={<ProtectedRoute><Painel setPlayerRadio={setPlayerRadio} playerRadio={playerRadio} playerVolume={playerVolume} setPlayerVolume={setPlayerVolume} /></ProtectedRoute>} />
                <Route path="/cadastro-radios" element={<ProtectedRoute><CadastroRadios /></ProtectedRoute>} />
                <Route path="/agendamentos" element={<ProtectedRoute><Agendamentos /></ProtectedRoute>} />
                <Route path="/novo-agendamento" element={<ProtectedRoute><NovoAgendamento /></ProtectedRoute>} />
                <Route path="/agendamento/:agendamentoId" element={<ProtectedRoute><AgendamentoRadio /></ProtectedRoute>} />
                <Route path="/gravacao-em-massa" element={<ProtectedRoute><GravacaoEmMassa /></ProtectedRoute>} />
                <Route path="/gravacoes" element={<ProtectedRoute><Gravacoes setGlobalAudioTrack={setGlobalAudioTrack} /></ProtectedRoute>} />
                <Route path="/gravador-manual" element={<ProtectedRoute><GravadorManual /></ProtectedRoute>} />
                <Route path="/edicao-ia" element={<ProtectedRoute><EdicaoIALanding /></ProtectedRoute>} />
                <Route path="/edicao-ia/:id" element={<ProtectedRoute><EdicaoIA setGlobalAudioTrack={setGlobalAudioTrack} /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/tags" element={<ProtectedRoute><Tags /></ProtectedRoute>} />
                <Route path="/historico" element={<ProtectedRoute><Historico setGlobalAudioTrack={setGlobalAudioTrack} /></ProtectedRoute>} />
                <Route path="/lista" element={<ProtectedRoute><Lista /></ProtectedRoute>} />
                <Route path="/status" element={<ProtectedRoute><SystemStatus /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/dashboard" />} />
              </Routes>
            </motion.main>
            
            <AudioPlayer
              src={playerRadio?.stream_url}
              isPlaying={!!playerRadio}
              volume={playerVolume}
              onEnded={() => setPlayerRadio(null)}
            />
            
            <GlobalAudioPlayer 
              track={globalAudioTrack} 
              onClose={() => setGlobalAudioTrack(null)} 
            />
    
            <footer className="fixed bottom-4 right-6 text-xs text-slate-200 font-light z-50 pointer-events-none">
              By MSL Estratégia - Comunicação & Marketing
            </footer>
          </div>
        </>
      );
    }
    
    export default App;
  