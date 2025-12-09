import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader, History, Headphones } from 'lucide-react';
import RecordingStatusCard from '@/components/RecordingStatusCard';

const Historico = ({ setGlobalAudioTrack }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [gravacoes, setGravacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTrack, setCurrentTrack] = useState(null);

  const fetchHistorico = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('gravacoes')
        .select('*, radios(nome, cidade, estado)')
        .eq('user_id', user.id)
        .eq('status', 'concluido')
        .order('criado_em', { ascending: false });

      if (error) throw error;
      setGravacoes(data);
    } catch (error) {
      toast({ title: 'Erro ao buscar histórico', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchHistorico();
  }, [fetchHistorico]);

  const handlePlay = (recording) => {
    const trackData = {
      src: recording.arquivo_url,
      title: recording.radios?.nome || 'Gravação',
      details: `Concluído em ${new Date(recording.criado_em).toLocaleString()}`,
    };
    setGlobalAudioTrack(trackData);
    setCurrentTrack(trackData);
  };

  const handleStop = () => {
    setGlobalAudioTrack(null);
    setCurrentTrack(null);
  };

  const handleDelete = async (recordingId, userId, fileName) => {
    try {
      const { error } = await supabase.functions.invoke('delete-recording', {
        body: { gravacao_id: recordingId },
      });
      if (error) throw error;

      toast({ title: 'Gravação excluída com sucesso!', variant: 'success' });
      setGravacoes(prev => prev.filter(rec => rec.id !== recordingId));
    } catch (error) {
      toast({ title: 'Erro ao excluir gravação', description: error.message, variant: 'destructive' });
    }
  };


  return (
    <>
      <Helmet>
        <title>Histórico de Gravações - IA Recorder</title>
        <meta name="description" content="Acesse todo o seu histórico de gravações concluídas." />
      </Helmet>
      <div className="p-6 max-w-7xl mx-auto space-y-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold gradient-text mb-2 flex items-center gap-3">
            <History /> Histórico de Gravações
          </h1>
          <p className="text-slate-400 text-lg">Aqui estão todas as gravações realizadas com sucesso.</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="card">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-white flex items-center gap-3"><Headphones className="text-cyan-400" />Gravações Concluídas</CardTitle>
                <span className="bg-slate-700 text-slate-300 px-3 py-1 rounded-full text-sm font-medium">{gravacoes.length} gravações</span>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center items-center h-48">
                  <Loader className="w-12 h-12 animate-spin text-cyan-400" />
                </div>
              ) : gravacoes.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <History className="w-16 h-16 mx-auto mb-4" />
                  <p className="font-semibold">Nenhum histórico de gravação encontrado.</p>
                  <p className="text-sm">Quando uma gravação for concluída, ela aparecerá aqui.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence>
                    {gravacoes.map(rec => (
                      <RecordingStatusCard
                        key={rec.id}
                        recording={rec}
                        onPlay={handlePlay}
                        onStop={handleStop}
                        onDelete={handleDelete}
                        currentTrack={currentTrack}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default Historico;