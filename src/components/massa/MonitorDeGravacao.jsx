import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Radio, RefreshCw, StopCircle } from 'lucide-react';
import { format } from 'date-fns';
import RecordingStatusCard from '@/components/RecordingStatusCard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const MonitorDeGravacao = ({ batchId, initialRecordings, setActiveBatch, setGlobalAudioTrack }) => {
  const { toast } = useToast();
  const [recordings, setRecordings] = useState(initialRecordings);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isStoppingAll, setIsStoppingAll] = useState(false);

  const fetchActiveRecordings = useCallback(async () => {
    if (!batchId) return;
    const { data, error } = await supabase
      .from('gravacoes')
      .select('*, radios(nome)')
      .eq('batch_id', batchId)
      .order('criado_em', { ascending: true });

    if (error) {
      toast({ title: 'Erro ao atualizar gravações', description: error.message, variant: 'destructive' });
    } else {
      setRecordings(data);
      if (data.every(r => r.status === 'concluido' || r.status === 'erro') && data.length > 0) {
          toast({ title: "Lote de Gravação Concluído!", description: "Todas as gravações foram finalizadas." });
      }
    }
  }, [batchId, toast]);

  useEffect(() => {
    const timer = setTimeout(fetchActiveRecordings, 2000); 
    const interval = setInterval(fetchActiveRecordings, 5000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [fetchActiveRecordings]);

  const handlePlayRecording = (recording) => {
    const trackData = {
        src: recording.arquivo_url,
        title: recording.arquivo_nome,
        details: `Gravado em: ${format(new Date(recording.criado_em), 'dd/MM/yyyy HH:mm')}`
    };
    setGlobalAudioTrack(trackData);
    setCurrentTrack(trackData);
  };
  
  const handleStopPlaying = () => {
      setGlobalAudioTrack(null);
      setCurrentTrack(null);
  };
  
  const handleDeleteRecording = async (id, userId, filename) => {
    try {
        const filePath = `${userId}/${filename}`;
        await supabase.storage.from('gravacoes').remove([filePath]);
        await supabase.from('gravacoes').delete().eq('id', id);
        toast({ title: "Gravação excluída" });
        setRecordings(prev => prev.filter(rec => rec.id !== id));
        if (currentTrack?.title === filename) handleStopPlaying();
    } catch (error) {
        toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    }
  };

  const handleStopIndividualRecording = async (id) => {
    try {
      const { error } = await supabase.from('gravacoes').update({ comando: 'stop' }).eq('id', id);
      if (error) throw error;
      toast({ title: "Comando para parar gravação enviado.", description: "A gravação será interrompida em breve." });
    } catch (error) {
       toast({ title: "Erro ao parar gravação", description: error.message, variant: "destructive" });
    }
  };

  const handleStopAll = async () => {
    setIsStoppingAll(true);
    try {
      const recordingIdsToStop = recordings.filter(r => r.status === 'gravando').map(r => r.id);
      if (recordingIdsToStop.length === 0) {
        toast({ title: "Nenhuma gravação ativa para parar." });
        return;
      }
      const { error } = await supabase.from('gravacoes').update({ comando: 'stop' }).in('id', recordingIdsToStop);
      if (error) throw error;
      toast({ title: "Comando para parar lote enviado!", description: `Solicitando parada para ${recordingIdsToStop.length} gravações.` });
    } catch(error) {
      toast({ title: "Erro ao parar lote", description: error.message, variant: "destructive" });
    } finally {
      setIsStoppingAll(false);
    }
  }

  return (
    <>
      <Helmet><title>Monitorando Gravação em Massa</title></Helmet>
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white flex items-center">
            <Radio className="w-8 h-8 mr-3 text-red-400 animate-pulse" />
            Monitor de Gravação em Massa
          </h1>
          <p className="text-md text-slate-400">Acompanhando {recordings.length} gravação(ões) em tempo real.</p>
        </motion.div>
        
        <Card className="p-4 md:p-6 bg-slate-800/40 border-slate-700/60">
          <div className="flex justify-between items-center mb-4">
              <div className="flex items-center space-x-2">
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={isStoppingAll}>
                        <StopCircle className="w-4 h-4 mr-2"/>
                        Parar Lote
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Parar todo o lote?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação enviará um comando para parar todas as gravações que ainda estão ativas neste lote. Deseja continuar?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleStopAll}>Sim, parar tudo</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button onClick={() => setActiveBatch(null)} variant="outline" size="sm">
                    Voltar
                  </Button>
              </div>
              <Button onClick={fetchActiveRecordings} variant="ghost" size="sm" className="text-slate-300 hover:text-white">
                  <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
              </Button>
          </div>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
              <AnimatePresence>
                  {recordings.map(rec => (
                    <RecordingStatusCard 
                      key={rec.id} 
                      recording={rec} 
                      onPlay={handlePlayRecording} 
                      onStop={handleStopPlaying}
                      onStopRecording={handleStopIndividualRecording}
                      currentTrack={currentTrack} 
                      onDelete={handleDeleteRecording} 
                    />)
                  )}
              </AnimatePresence>
              {recordings.length === 0 && <p className="text-center text-slate-400 py-8">Aguardando início das gravações...</p>}
          </div>
        </Card>
      </div>
    </>
  )
}

export default MonitorDeGravacao;