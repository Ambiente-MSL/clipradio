
import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut, User, LayoutDashboard, Radio, Calendar, FileText, Mic, Tag, CircleDot, X, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';
import apiClient from '@/lib/apiClient';

const baseNavItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Rádios', path: '/cadastro-radios', icon: Radio },
  { name: 'Agendamentos', path: '/agendamentos', icon: Calendar },
  { name: 'Gravações', path: '/gravacoes', icon: FileText },
  { name: 'Gravar manual', path: '/gravador-manual', icon: Mic },
  { name: 'Tags', path: '/tags', icon: Tag },
];
const adminNavItems = [
  { name: 'Admin', path: '/admin', icon: Shield },
];

const parseTimestamp = (value) => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

const formatProgressTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const getDurationSeconds = (record) => {
  const secondsValue = Number(record?.duracao_segundos ?? record?.duration_seconds);
  if (Number.isFinite(secondsValue) && secondsValue > 0) return secondsValue;
  const minutesValue = Number(
    record?.duracao_minutos ??
    record?.duracao ??
    record?.duration_minutes
  );
  if (Number.isFinite(minutesValue) && minutesValue > 0) return minutesValue * 60;
  return 0;
};

const normalizeOngoingRecord = (record) => {
  if (!record) return null;
  const id = record?.id != null ? String(record.id) : null;
  if (!id) return null;
  return {
    id,
    radioNome: record.radioNome || record?.radios?.nome || record?.nome || '',
    startedAt: record.startedAt || record?.criado_em || record?.data_inicio || record?.created_at,
    durationSeconds: getDurationSeconds(record),
    status: record?.status || 'gravando',
    tipo: record?.tipo,
  };
};

const mergeOngoingRecords = (prev, next, nowMs) => {
  const prevMap = new Map(prev.map((rec) => [rec.id, rec]));
  const nextMap = new Map();

  next.forEach((rec) => {
    if (!rec?.id) return;
    const existing = prevMap.get(rec.id);
    const merged = existing
      ? { ...existing, ...rec, radioNome: rec.radioNome || existing.radioNome }
      : rec;
    nextMap.set(rec.id, merged);
  });

  prev.forEach((rec) => {
    if (!rec?.id || nextMap.has(rec.id)) return;
    const startMs = parseTimestamp(rec.startedAt);
    const durationSeconds = rec.durationSeconds || 0;
    if (startMs && durationSeconds) {
      const endMs = startMs + durationSeconds * 1000 + 60000;
      if (nowMs <= endMs) {
        nextMap.set(rec.id, rec);
      }
      return;
    }
    if (startMs && nowMs - startMs <= 6 * 60 * 60 * 1000) {
      nextMap.set(rec.id, rec);
    }
  });

  return Array.from(nextMap.values()).sort((a, b) => {
    const aStart = parseTimestamp(a.startedAt) || 0;
    const bStart = parseTimestamp(b.startedAt) || 0;
    return bStart - aStart;
  });
};

const Navbar = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showRecordingPanel, setShowRecordingPanel] = useState(false);
  const [ongoingRecords, setOngoingRecords] = useState([]);
  const [now, setNow] = useState(Date.now());
  const navItems = useMemo(
    () => (user?.is_admin ? [...baseNavItems, ...adminNavItems] : baseNavItems),
    [user],
  );

  const getNavLinkClass = (path) => {
    const baseClass = 'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all duration-300';
    const activeClass = 'bg-cyan-500/10 text-cyan-400';
    const inactiveClass = 'text-slate-400 hover:text-white hover:bg-slate-700/50';

    return location.pathname === path ? `${baseClass} ${activeClass}` : `${baseClass} ${inactiveClass}`;
  };

  useEffect(() => {
    const handler = (event) => {
      const detail = event.detail || {};
      const normalized = normalizeOngoingRecord(detail);
      if (!normalized) return;
      setOngoingRecords((prev) => {
        if (prev.some((r) => r.id === normalized.id)) return prev;
        return [normalized, ...prev];
      });
      setShowRecordingPanel(true);
    };
    window.addEventListener('recording-started', handler);
    return () => window.removeEventListener('recording-started', handler);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchOngoing = async () => {
      try {
        const data = await apiClient.getOngoingRecordings();
        if (cancelled) return;
        const normalized = (data || []).map(normalizeOngoingRecord).filter(Boolean);
        setOngoingRecords((prev) => mergeOngoingRecords(prev, normalized, Date.now()));
      } catch (error) {
        // Ignore polling errors to keep the navbar responsive.
      }
    };
    fetchOngoing();
    const interval = setInterval(fetchOngoing, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

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
                    <p className="text-sm font-semibold text-white">Gravações em andamento</p>
                    <p className="text-xs text-slate-400">{ongoingRecords.length} ativas</p>
                  </div>
                  <button onClick={() => setShowRecordingPanel(false)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {ongoingRecords.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-slate-400 text-center">Nenhuma gravação no momento.</div>
                  ) : (
                    ongoingRecords.map((rec) => {
                      const startMs = parseTimestamp(rec.startedAt);
                      const elapsedSeconds = startMs ? Math.max(0, Math.floor((now - startMs) / 1000)) : 0;
                      const durationSeconds = rec.durationSeconds || 0;
                      const progressPercent = durationSeconds > 0
                        ? Math.min(100, (elapsedSeconds / durationSeconds) * 100)
                        : 100;
                      const statusValue = String(rec.status || '').toLowerCase();
                      const statusLabel = statusValue === 'parando'
                        ? 'Parando'
                        : statusValue === 'processando'
                          ? 'Processando'
                          : statusValue === 'iniciando' && elapsedSeconds < 8
                            ? 'Iniciando'
                            : 'Gravando';
                      const barClass = durationSeconds > 0
                        ? 'bg-gradient-to-r from-cyan-400 via-emerald-400 to-lime-400'
                        : 'bg-slate-600/60 animate-pulse';
                      return (
                        <div key={rec.id} className="px-4 py-3 border-b border-slate-800 last:border-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <CircleDot className="w-4 h-4 text-red-400 animate-pulse mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-white truncate">{rec.radioNome || 'Radio'}</p>
                                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                                  <span>{formatProgressTime(elapsedSeconds)}</span>
                                  <span>{formatProgressTime(durationSeconds)}</span>
                                </div>
                                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800/80 overflow-hidden">
                                  <div
                                    className={`h-full transition-[width] duration-500 ${barClass}`}
                                    style={{ width: `${progressPercent}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                            <span className="text-[10px] text-slate-300 px-2 py-1 rounded-full bg-slate-800 border border-slate-700 whitespace-nowrap">
                              {statusLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })

                  )}
                </div>
                <NavLink
                  to="/gravacoes"
                  className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-cyan-300 hover:bg-slate-800 border-t border-slate-800"
                  onClick={() => setShowRecordingPanel(false)}
                >
                  <FileText className="w-4 h-4" />
                  Abrir gravações
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
