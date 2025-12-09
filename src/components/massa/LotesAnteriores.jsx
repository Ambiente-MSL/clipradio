import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card } from '@/components/ui/card';
import { Loader, Archive, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import RecordingStatusCard from '@/components/RecordingStatusCard';

const LotesAnteriores = ({ setGlobalAudioTrack }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedBatch, setExpandedBatch] = useState(null);
  const [batchRecordings, setBatchRecordings] = useState([]);
  const [loadingRecordings, setLoadingRecordings] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);

  const fetchBatches = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('listar_lotes_gravacao_massa', { p_user_id: user.id });
    if (error) {
      toast({ title: 'Erro ao buscar lotes', description: error.message, variant: 'destructive' });
    } else {
      setBatches(data);
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);
  
  const handleToggleBatch = async (batchId) => {
    if (expandedBatch === batchId) {
      setExpandedBatch(null);
      setBatchRecordings([]);
    } else {
      setExpandedBatch(batchId);
      setLoadingRecordings(true);
      const { data, error } = await supabase
        .from('gravacoes')
        .select('*, radios(nome)')
        .eq('batch_id', batchId)
        .order('criado_em', { ascending: true });
      if (error) {
        toast({ title: 'Erro ao buscar gravações do lote', description: error.message, variant: 'destructive' });
        setBatchRecordings([]);
      } else {
        setBatchRecordings(data);
      }
      setLoadingRecordings(false);
    }
  };

  const handlePlayRecording = (recording) => {
    const trackData = {
        src: recording.arquivo_url,
        title: recording.arquivo_nome,
        details: `Gravado em: ${format(new Date(recording.criado_em), 'dd/MM/yyyy HH:mm')}`
    };
    setGlobalAudioTrack(trackData);
    setCurrentTrack(trackData);
  };
  
  const handleStopRecording = () => {
      setGlobalAudioTrack(null);
      setCurrentTrack(null);
  };

  const handleDeleteRecording = async (id, userId, filename) => {
    try {
      const filePath = `${userId}/${filename}`;
      await supabase.storage.from('gravacoes').remove([filePath]);
      await supabase.from('gravacoes').delete().eq('id', id);
      toast({ title: "Gravação excluída", description: "O arquivo foi removido com sucesso." });
      setBatchRecordings(prev => prev.filter(rec => rec.id !== id));
      if (currentTrack?.title === filename) handleStopRecording();
    } catch (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    }
  };

  const handleStopIndividualRecording = async (id) => {
    try {
      const { error } = await supabase
        .from('gravacoes')
        .update({ comando: 'stop' })
        .eq('id', id);
      if (error) throw error;
      toast({ title: 'Comando para parar enviado!' });
    } catch (error) {
      toast({ title: 'Erro ao parar gravação', description: error.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-48"><Loader className="w-8 h-8 animate-spin text-cyan-400" /></div>;
  }
  
  return (
    <div className="space-y-4">
      {batches.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-700 rounded-lg">
          <Archive className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg">Nenhum lote de gravação encontrado</p>
          <p className="text-slate-500">Inicie uma nova gravação em massa para ver os lotes aqui.</p>
        </div>
      ) : (
        batches.map((batch) => (
          <Card key={batch.batch_id} className="bg-slate-800/40 border-slate-700/60 overflow-hidden">
            <button onClick={() => handleToggleBatch(batch.batch_id)} className="w-full text-left p-4 hover:bg-slate-800/80 transition-colors flex justify-between items-center">
              <div>
                <p className="font-semibold text-white">Lote de {format(new Date(batch.primeira_gravacao), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
                <p className="text-sm text-slate-400">{batch.total_gravacoes} gravações | {batch.total_concluido} concluídas, {batch.total_erro} com erro</p>
              </div>
              <motion.div animate={{ rotate: expandedBatch === batch.batch_id ? 180 : 0 }}>
                <ChevronDown className="w-5 h-5 text-slate-300" />
              </motion.div>
            </button>
            <AnimatePresence>
              {expandedBatch === batch.batch_id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-4 border-t border-slate-700/60">
                    {loadingRecordings ? (
                      <div className="flex justify-center p-4"><Loader className="w-6 h-6 animate-spin text-cyan-400" /></div>
                    ) : (
                      <div className="space-y-3">
                        {batchRecordings.map(rec => (
                          <RecordingStatusCard 
                            key={rec.id} 
                            recording={rec} 
                            onPlay={handlePlayRecording} 
                            onStop={handleStopRecording} 
                            currentTrack={currentTrack}
                            onDelete={handleDeleteRecording}
                            onStopRecording={handleStopIndividualRecording}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        ))
      )}
    </div>
  );
};

export default LotesAnteriores;