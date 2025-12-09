
    import React, { useState, useEffect, useCallback } from 'react';
    import { motion } from 'framer-motion';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { useNavigate } from 'react-router-dom';
    import { useToast } from '@/components/ui/use-toast';
    import { Radio, Calendar, Download, Loader, Plus, LayoutGrid, List } from 'lucide-react';
    import { Card, CardContent } from '@/components/ui/card';
    import { Button } from '@/components/ui/button';
    import { Helmet } from 'react-helmet';
    
    const Dashboard = () => {
      const [stats, setStats] = useState({ radios: 0, agendamentos: 0, gravacoes: 0 });
      const [loadingStats, setLoadingStats] = useState(true);
      const { user } = useAuth();
      const navigate = useNavigate();
      const { toast } = useToast();
    
      const fetchStats = useCallback(async () => {
        if (!user) return;
        setLoadingStats(true);
        try {
          const { count: radiosCount, error: radiosError } = await supabase.from('radios').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
          const { count: agendamentosCount, error: agendamentosError } = await supabase.from('agendamentos').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'agendado');
          const { count: gravacoesCount, error: gravacoesError } = await supabase.from('gravacoes').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
    
          if (radiosError || agendamentosError || gravacoesError) throw radiosError || agendamentosError || gravacoesError;
          
          setStats({ radios: radiosCount || 0, agendamentos: agendamentosCount || 0, gravacoes: gravacoesCount || 0 });
        } catch (error) {
          toast({ title: 'Erro ao buscar estatísticas', description: error.message, variant: 'destructive' });
        }
        setLoadingStats(false);
      }, [user, toast]);
    
      
      useEffect(() => {
        if (user) {
          fetchStats();
        }
        
        const channel = supabase.channel('dashboard-stats-realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'radios', filter: `user_id=eq.${user?.id}` }, () => fetchStats())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos', filter: `user_id=eq.${user?.id}` }, () => fetchStats())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'gravacoes', filter: `user_id=eq.${user?.id}` }, () => fetchStats())
          .subscribe();
    
        return () => {
          supabase.removeChannel(channel);
        };
      }, [user, fetchStats]);
    
      
      const StatCard = ({ icon, title, value, loading, colorClass, onNavigate }) => (
        <motion.div whileHover={{ scale: 1.05 }} transition={{ type: 'spring', stiffness: 300 }}>
          <Card className="glass-effect overflow-hidden cursor-pointer" onClick={onNavigate}>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-md text-muted-foreground font-medium">{title}</p>
                {loading ? (
                  <Loader className="w-8 h-8 animate-spin mt-1 text-primary" />
                ) : (
                  <p className="text-4xl font-bold text-foreground">{value}</p>
                )}
              </div>
              <div className={`p-4 rounded-full ${colorClass}`}>
                {icon}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      );
    
      return (
        <>
          <Helmet>
            <title>Dashboard - IA Recorder</title>
            <meta name="description" content="Visão geral do seu sistema de gravação de rádios." />
          </Helmet>
          <div className="p-4 md:p-6 max-w-7xl mx-auto">
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-3xl md:text-4xl font-bold gradient-text">Dashboard</h1>
              <p className="text-muted-foreground mt-2 text-lg">Visão geral do sistema de gravação.</p>
            </motion.div>
    
            <motion.div 
              className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, staggerChildren: 0.1 }}
            >
              <StatCard
                icon={<Radio className="w-8 h-8 text-primary-foreground" />}
                title="Rádios Cadastradas"
                value={stats.radios}
                loading={loadingStats}
                colorClass="bg-green-500/80"
                onNavigate={() => navigate('/cadastro-radios')}
              />
              <StatCard
                icon={<Calendar className="w-8 h-8 text-primary-foreground" />}
                title="Agendamentos Ativos"
                value={stats.agendamentos}
                loading={loadingStats}
                colorClass="bg-blue-500/80"
                onNavigate={() => navigate('/agendamentos')}
              />
              <StatCard
                icon={<Download className="w-8 h-8 text-primary-foreground" />}
                title="Gravações"
                value={stats.gravacoes}
                loading={loadingStats}
                colorClass="bg-purple-500/80"
                onNavigate={() => navigate('/gravacoes')}
              />
            </motion.div>
    
            <motion.div 
              className="mt-8 text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
               <div className="card">
                  <h2 className="text-2xl font-bold text-foreground">Acesse o Painel de Rádios</h2>
                  <p className="text-muted-foreground mt-2 mb-6">Controle suas rádios, ouça ao vivo, grave manualmente e veja seus agendamentos.</p>
                  <Button className="btn btn-primary" onClick={() => navigate('/painel')}>
                    <LayoutGrid className="w-5 h-5 mr-2" />
                    Ir para o Painel
                  </Button>
               </div>
            </motion.div>
          </div>
        </>
      );
    };
    
    export default Dashboard;
  