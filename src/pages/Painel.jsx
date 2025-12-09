
import React, { useState, useEffect, useCallback } from 'react';
    import { motion } from 'framer-motion';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { useNavigate } from 'react-router-dom';
    import { useToast } from '@/components/ui/use-toast';
    import { Radio, Loader, Plus, LayoutGrid, List } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import RadioPanelItem from '@/components/RadioPanelItem';
    import RadioListItem from '@/components/RadioListItem';
    import { Helmet } from 'react-helmet';
    import { cn } from '@/lib/utils';
    
    const Painel = ({ playerRadio, setPlayerRadio, playerVolume, setPlayerVolume }) => {
      const [radios, setRadios] = useState([]);
      const [loadingRadios, setLoadingRadios] = useState(true);
      const { user } = useAuth();
      const navigate = useNavigate();
      const { toast } = useToast();
    
      const [volumes, setVolumes] = useState({});
      const [viewMode, setViewMode] = useState('kanban');
    
      const fetchRadios = useCallback(async () => {
        if (!user) return;
        setLoadingRadios(true);
        try {
          const { data, error } = await supabase
            .from('radios')
            .select(`
              *,
              gravacoes(id, status),
              agendamentos(id, status)
            `)
            .eq('user_id', user.id)
            .order('favorita', { ascending: false })
            .order('criado_em', { ascending: false });
            
          if (error) throw error;
    
          const processedRadios = data.map(radio => {
            const gravacoesAtivas = radio.gravacoes || [];
            const agendamentosAtivos = radio.agendamentos || [];
            
            const estaGravando = gravacoesAtivas.some(g => g.status === 'gravando' || g.status === 'iniciando');
            const temAgendamentoAtivo = agendamentosAtivos.some(a => a.status === 'agendado');
            
            return { ...radio, estaGravando, temAgendamentoAtivo };
          });
    
          setRadios(processedRadios);
          const initialVolumes = data.reduce((acc, radio) => {
            acc[radio.id] = playerVolume;
            return acc;
          }, {});
          setVolumes(initialVolumes);
        } catch (error) {
           toast({ title: 'Erro ao buscar rádios', description: error.message, variant: 'destructive' });
        }
        setLoadingRadios(false);
      }, [user, toast, playerVolume]);
      
      useEffect(() => {
        if (user) {
          fetchRadios();
        }
        
        const channel = supabase.channel('painel-realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'radios', filter: `user_id=eq.${user?.id}` }, fetchRadios)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'gravacoes', filter: `user_id=eq.${user?.id}` }, fetchRadios)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos', filter: `user_id=eq.${user?.id}` }, fetchRadios)
          .subscribe();
    
        return () => {
          supabase.removeChannel(channel);
        };
      }, [user, fetchRadios]);
    
      const handlePlayPause = (radio) => {
        if (playerRadio && playerRadio.id === radio.id) {
          setPlayerRadio(null);
        } else {
          setPlayerRadio(radio);
        }
      };
    
      const handleVolumeChange = (radioId, newVolume) => {
        setPlayerVolume(newVolume);
        setVolumes(prev => ({ ...prev, [radioId]: newVolume }));
      };
    
      const handleRecord = async (radio) => {
        navigate('/gravador-manual', { state: { radio } });
      };
      
      const handleToggleFavorite = async (radio) => {
        try {
          const { data, error } = await supabase
            .from('radios')
            .update({ favorita: !radio.favorita })
            .eq('id', radio.id)
            .select()
            .single();
    
          if (error) throw error;
    
          toast({
            title: data.favorita ? 'Adicionada aos Favoritos' : 'Removida dos Favoritos',
            description: `${radio.nome} foi ${data.favorita ? 'marcada como favorita' : 'desmarcada'}.`,
          });
          fetchRadios();
        } catch (error) {
          toast({ title: 'Erro ao favoritar', description: error.message, variant: 'destructive' });
        }
      };
    
      const renderRadios = () => {
        if (loadingRadios) {
          return <div className="flex justify-center items-center h-96"><Loader className="w-12 h-12 animate-spin text-primary" /></div>;
        }
    
        if (radios.length === 0) {
          return (
            <div className="text-center py-20 card">
              <Radio className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-foreground mb-2">Nenhuma rádio cadastrada ainda</h3>
              <p className="text-muted-foreground mb-6">Comece adicionando sua primeira rádio para ativar o gravador.</p>
              <Button className="btn btn-primary" onClick={() => navigate('/cadastro-radios')}>
                <Plus className="w-5 h-5 mr-2" />
                Adicionar Nova Rádio
              </Button>
            </div>
          );
        }
        
        const radioItems = radios.map((radio, index) => {
          const isPlaying = playerRadio?.id === radio.id;
          
          const panelProps = {
            key: `${radio.id}-panel`,
            radio,
            index,
            isPlaying,
            onPlayPause: handlePlayPause,
            onRecord: handleRecord,
            volume: volumes[radio.id] || playerVolume,
            onVolumeChange: handleVolumeChange,
            onToggleFavorite: handleToggleFavorite,
          };
    
          const listProps = {
            key: `${radio.id}-list`,
            radio,
            index,
            isPlaying,
            onToggleFavorite: handleToggleFavorite,
          };
    
          return viewMode === 'kanban' ? <RadioPanelItem {...panelProps} /> : <RadioListItem {...listProps} />;
        });
    
        if (viewMode === 'kanban') {
          return <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">{radioItems}</div>;
        } else {
          return <div className="flex flex-col gap-2">{radioItems}</div>;
        }
      };
    
      return (
        <>
          <Helmet>
            <title>Painel de Rádios - IA Recorder</title>
            <meta name="description" content="Controle todas as suas rádios em um só lugar." />
          </Helmet>
          <div className="p-4 md:p-6 max-w-full mx-auto">
            <motion.div 
              className="flex justify-between items-center mb-6"
              initial={{ opacity: 0, y: -20 }} 
              animate={{ opacity: 1, y: 0 }}
            >
              <div>
                <h1 className="text-3xl md:text-4xl font-bold gradient-text">Painel de Controle das Rádios</h1>
                <p className="text-muted-foreground mt-2 text-lg">Gerencie suas estações de rádio e agende gravações</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Visualizar como:</span>
                  <div className="bg-secondary p-1 rounded-lg flex items-center">
                    <Button variant="ghost" size="sm" onClick={() => setViewMode('kanban')} className={cn("px-3 py-1 h-auto flex items-center gap-2", viewMode === 'kanban' && 'bg-primary/20 text-primary')}>
                      <LayoutGrid className="w-4 h-4" />
                      Kanban
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setViewMode('list')} className={cn("px-3 py-1 h-auto flex items-center gap-2", viewMode === 'list' && 'bg-primary/20 text-primary')}>
                      <List className="w-4 h-4" />
                      Lista
                    </Button>
                  </div>
                </div>
                <Button className="btn btn-primary" onClick={() => navigate('/cadastro-radios')}>
                  <Plus className="w-5 h-5 mr-2" />
                  Adicionar Rádio
                </Button>
              </div>
            </motion.div>
    
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {renderRadios()}
            </motion.div>
          </div>
        </>
      );
    };
    
    export default Painel;
  