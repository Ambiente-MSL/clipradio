
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Play, Pause, Download, Bot, Trash2, Clock, FileArchive, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate } from 'react-router-dom';

const GravacaoItem = ({ gravacao, index, isPlaying, onPlay, onStop, setGlobalAudioTrack, onDelete, isSelected, onToggleSelection }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);

  const handlePlay = () => {
    if (!gravacao.arquivo_url) {
      toast({ title: 'Áudio indisponível', description: 'O arquivo desta gravação não foi encontrado.', variant: 'destructive' });
      return;
    }
    if (isPlaying) {
      onStop();
      setGlobalAudioTrack(null);
    } else {
      onPlay();
      setGlobalAudioTrack({
        src: gravacao.arquivo_url,
        title: gravacao.radios?.nome || 'Gravação',
        subtitle: format(new Date(gravacao.criado_em), "d 'de' MMMM, yyyy 'às' HH:mm", { locale: ptBR }),
      });
    }
  };

  const handleDownload = async () => {
    if (!gravacao.arquivo_url) {
      toast({ title: "Download indisponível", description: "O arquivo desta gravação não foi encontrado.", variant: 'destructive' });
      return;
    }
    try {
      const response = await fetch(gravacao.arquivo_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `gravacao_${gravacao.id}.mp3`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: "Download Iniciado", description: "O arquivo de áudio está sendo baixado." });
    } catch (error) {
      toast({ title: "Erro no Download", description: error.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const { error } = await supabase.functions.invoke('delete-recordings-batch', {
      body: JSON.stringify({ gravacao_ids: [gravacao.id] }),
    });
    setIsDeleting(false);

    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Gravação excluída!", description: "A gravação foi removida com sucesso.", variant: "success" });
      onDelete(gravacao.id);
    }
  };

  const handleEditWithIA = () => {
    navigate(`/edicao-ia/${gravacao.id}`);
  };

  const statusColors = {
    concluido: 'bg-green-500/20 text-green-400 border-green-500/30',
    gravando: 'bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse',
    erro: 'bg-red-500/20 text-red-400 border-red-500/30',
    iniciando: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    agendado: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    processando: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30 animate-pulse',
  };

  const statusText = {
    concluido: 'Concluído',
    gravando: 'Gravando',
    erro: 'Erro',
    iniciando: 'Iniciando',
    agendado: 'Agendado',
    processando: 'Processando IA',
  };

  const tipoLabel = (tipo) => {
    if (!tipo) return 'Manual';
    const map = { manual: 'Manual', agendado: 'Agendado', massa: 'Em massa' };
    return map[tipo] || tipo;
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds < 0) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -50, scale: 0.9 }}
      transition={{ duration: 0.5, delay: index * 0.05, type: 'spring', stiffness: 120 }}
      className={`card-item flex items-center p-4 gap-4 transition-all duration-300 ${isSelected ? 'bg-primary/10 border-primary' : 'border-transparent'}`}
    >
      <div className="flex items-center">
        <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelection(gravacao.id)} className="mr-4" />
        <Button size="icon" variant="ghost" className="rounded-full w-14 h-14" onClick={handlePlay}>
          {isPlaying ? <Pause className="w-6 h-6 text-primary" /> : <Play className="w-6 h-6 text-primary" />}
        </Button>
      </div>

      <div className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col">
          <span className="font-bold text-lg text-foreground truncate">{gravacao.radios?.nome || 'Rádio Desconhecida'}</span>
          <span className="text-sm text-muted-foreground">{format(new Date(gravacao.criado_em), "d MMM, yyyy '•' HH:mm", { locale: ptBR })}</span>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4 text-blue-400" />
            <span>{formatDuration(gravacao.duracao_segundos)}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileArchive className="w-4 h-4 text-green-400" />
            <span>{Number(gravacao.tamanho_mb || 0).toFixed(2)} MB</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mic className="w-4 h-4 text-purple-400" />
            <span>{tipoLabel(gravacao.tipo)}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${statusColors[gravacao.status] || statusColors.agendado}`}>
            {statusText[gravacao.status] || 'Desconhecido'}
          </span>
          <Button size="sm" variant="outline" onClick={handleEditWithIA}>
            <Bot className="w-4 h-4 mr-2" /> Editar com IA
          </Button>
          <Button size="icon" variant="ghost" onClick={handleDownload} disabled={!gravacao.arquivo_url}>
            <Download className="w-5 h-5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive-foreground hover:bg-destructive/90">
                <Trash2 className="w-5 h-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação não pode ser desfeita. Isso excluirá permanentemente a gravação e todos os dados associados, incluindo clipes de IA.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </motion.div>
  );
};

export default GravacaoItem;
