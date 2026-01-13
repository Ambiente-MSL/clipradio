import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { Timer, Users, CalendarClock, Radio } from 'lucide-react';
import apiClient from '@/lib/apiClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';

const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return '0h 00m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
};

const AdminRelatorios = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user?.is_admin) {
      navigate('/dashboard', { replace: true });
    }
  }, [loading, navigate, user]);

  const fetchStats = async () => {
    if (!user?.is_admin) return;
    setIsLoading(true);
    try {
      const data = await apiClient.getAdminQuickStats();
      setStats(data);
    } catch (error) {
      toast({
        title: 'Falha ao carregar relatórios.',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.is_admin]);

  const cards = useMemo(() => ([
    {
      title: 'Tempo total gravado',
      value: formatDuration(stats?.total_duration_seconds || 0),
      helper: `${stats?.total_duration_hours || 0} horas acumuladas`,
      icon: <Timer className="w-5 h-5 text-cyan-300" />,
      gradient: 'from-cyan-600/50 via-cyan-500/30 to-slate-900',
    },
    {
      title: 'Usuários cadastrados',
      value: stats?.total_users ?? '--',
      helper: 'inclui todos os perfis ativos',
      icon: <Users className="w-5 h-5 text-emerald-300" />,
      gradient: 'from-emerald-600/50 via-emerald-500/30 to-slate-900',
    },
    {
      title: 'Quem mais agenda',
      value: stats?.top_scheduler?.nome || 'Sem dados',
      helper: stats?.top_scheduler ? `${stats.top_scheduler.total_agendamentos} agendamentos` : 'Nenhum agendamento ainda',
      icon: <CalendarClock className="w-5 h-5 text-amber-300" />,
      gradient: 'from-amber-600/40 via-amber-500/20 to-slate-900',
    },
    {
      title: 'Rádio com mais horas',
      value: stats?.top_radio?.nome || 'Sem dados',
      helper: stats?.top_radio ? formatDuration(stats.top_radio.total_duration_seconds) : 'Grave para começar a medir',
      icon: <Radio className="w-5 h-5 text-fuchsia-300" />,
      gradient: 'from-fuchsia-600/40 via-fuchsia-500/20 to-slate-900',
    },
  ]), [stats]);

  if (loading || isLoading) {
    return (
      <div className="px-6">
        <Helmet><title>Relatórios | Clipradio</title></Helmet>
        <div className="max-w-6xl mx-auto mt-10 bg-slate-900/60 border border-slate-800 rounded-xl p-8 text-slate-300">
          Carregando relatórios...
        </div>
      </div>
    );
  }

  return (
    <div className="px-6">
      <Helmet>
        <title>Relatórios | Clipradio</title>
      </Helmet>

      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400 uppercase tracking-[0.2em]">Admin</p>
            <h1 className="text-3xl md:text-4xl font-bold text-white mt-1">Relatórios rápidos</h1>
            <p className="text-slate-400 mt-1">Visão consolidada de uso e gravações.</p>
          </div>
          <Button variant="outline" onClick={fetchStats} className="border-slate-700 text-slate-100 hover:border-cyan-400">
            Recarregar
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {cards.map((card) => (
            <div
              key={card.title}
              className={`relative overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br ${card.gradient} p-5 shadow-xl`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-300 text-sm">{card.title}</p>
                  <p className="text-2xl font-semibold text-white mt-1">{card.value}</p>
                  <p className="text-xs text-slate-400 mt-1">{card.helper}</p>
                </div>
                <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-lg">
                  {card.icon}
                </div>
              </div>
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-white/5 via-transparent to-transparent" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminRelatorios;
