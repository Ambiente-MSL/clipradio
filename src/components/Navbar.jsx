
import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut, User, LayoutDashboard, Radio, Calendar, FileText, Mic, Tag, CircleDot, X } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';

const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Rádios', path: '/cadastro-radios', icon: Radio },
  { name: 'Agendamentos', path: '/agendamentos', icon: Calendar },
  { name: 'Gravações', path: '/gravacoes', icon: FileText },
  { name: 'Gravar Manual', path: '/gravador-manual', icon: Mic },
  { name: 'Tags', path: '/tags', icon: Tag },
];

const Navbar = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showRecordingPanel, setShowRecordingPanel] = useState(false);
  const [ongoingRecords, setOngoingRecords] = useState([]);

  const getNavLinkClass = (path) => {
    const baseClass = 'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all duration-300';
    const activeClass = 'bg-cyan-500/10 text-cyan-400';
    const inactiveClass = 'text-slate-400 hover:text-white hover:bg-slate-700/50';

    return location.pathname === path ? `${baseClass} ${activeClass}` : `${baseClass} ${inactiveClass}`;
  };

  useEffect(() => {
    const handler = (event) => {
      const detail = event.detail || {};
      setOngoingRecords((prev) => {
        if (prev.some((r) => r.id === detail.id)) return prev;
        return [
          {
            id: detail.id,
            radioNome: detail.radioNome || 'Radio',
            duracao: detail.duracao,
            startedAt: detail.startedAt,
            status: detail.status || 'gravando',
          },
          ...prev,
        ];
      });
      setShowRecordingPanel(true);
    };
    window.addEventListener('recording-started', handler);
    return () => window.removeEventListener('recording-started', handler);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  if (!user) {
    return null;
  }

  return (
    <motion.header
      initial={{ y: -120 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      className="fixed top-0 left-0 right-0 z-40 bg-slate-900/50 backdrop-blur-lg border-b border-slate-800"
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-slate-400 text-2xl font-light">|</span>
            <h1 className="text-2xl font-bold text-cyan-400 tracking-wider">
              Clipradio
            </h1>
          </div>
        </div>

        <div className="flex items-center justify-between h-12">
          <nav className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-hide">
            {navItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                className={getNavLinkClass(item.path)}
              >
                <item.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{item.name}</span>
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-4 relative">
            <button
              className="relative p-2 rounded-md bg-slate-800/60 border border-slate-700 hover:border-cyan-500 transition-colors"
              onClick={() => setShowRecordingPanel((prev) => !prev)}
            >
              <CircleDot className="w-5 h-5 text-red-400" />
              {ongoingRecords.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              )}
            </button>
            {showRecordingPanel && (
              <div className="absolute right-0 top-12 w-80 bg-slate-900 border border-slate-800 rounded-lg shadow-2xl overflow-hidden z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                  <div>
                    <p className="text-sm font-semibold text-white">Gravacoes em andamento</p>
                    <p className="text-xs text-slate-400">{ongoingRecords.length} ativas</p>
                  </div>
                  <button onClick={() => setShowRecordingPanel(false)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {ongoingRecords.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-slate-400 text-center">Nenhuma gravacao no momento.</div>
                  ) : (
                    ongoingRecords.map((rec) => (
                      <div key={rec.id} className="px-4 py-3 flex items-center justify-between border-b border-slate-800 last:border-0">
                        <div className="flex items-center gap-3">
                          <CircleDot className="w-4 h-4 text-red-400 animate-pulse" />
                          <div>
                            <p className="text-sm font-semibold text-white">{rec.radioNome}</p>
                            <p className="text-xs text-slate-400">Duração: {rec.duracao} min</p>
                          </div>
                        </div>
                        <span className="text-xs text-slate-300 px-2 py-1 rounded-full bg-slate-800 border border-slate-700">
                          {rec.status === 'gravando' ? 'Gravando' : 'Iniciando'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <NavLink
                  to="/gravacoes"
                  className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-cyan-300 hover:bg-slate-800 border-t border-slate-800"
                  onClick={() => setShowRecordingPanel(false)}
                >
                  <FileText className="w-4 h-4" />
                  Abrir gravacoes
                </NavLink>
              </div>
            )}
            <NavLink to="/profile" className={getNavLinkClass('/profile')}>
              <User className="w-5 h-5" />
            </NavLink>
            <Button variant="ghost" size="icon" onClick={handleSignOut} className="text-slate-400 hover:text-white transition-colors">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </motion.header>
  );
};

export default Navbar;
