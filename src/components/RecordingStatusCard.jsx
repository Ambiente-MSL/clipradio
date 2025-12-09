import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Radio, StopCircle, AlertTriangle, Loader, Clock, Play, Square, Pencil, Trash2 } from 'lucide-react';

const RecordingStatusCard = ({ recording, onPlay, onStop, currentTrack, onDelete, onStopRecording }) => {
  const [elapsed, setElapsed] = useState(0);
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false); // Declaração do estado

  useEffect(() => {
    if (recording.status === 'gravando') {
      const interval = setInterval(() => {
        const startTime = new Date(recording.criado_em).getTime();
        const now = Date.now();
        setElapsed(Math.floor((now - startTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [recording.status, recording.criado_em]);

  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return '00:00:00';
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const getStatusInfo = () => {
    switch(recording.status) {
      case 'gravando':
        return { icon: <Radio className="w-5 h-5 text-red-400 animate-pulse" />, text: 'Gravando', color: 'text-red-400' };
      case 'concluido':
        return { icon: <StopCircle className="w-5 h-5 text-green-400" />, text: 'Concluído', color: 'text-green-400' };
      case 'erro':
        return { icon: <AlertTriangle className="w-5 h-5 text-yellow-400" />, text: 'Erro', color: 'text-yellow-400' };
      case 'parando':
        return { icon: <Loader className="w-5 h-5 text-orange-400 animate-spin" />, text: 'Parando...', color: 'text-orange-400' };
      default:
        return { icon: <Loader className="w-5 h-5 text-muted-foreground animate-spin" />, text: 'Iniciando', color: 'text-muted-foreground' };
    }
  };

  const { icon, text, color } = getStatusInfo();
  const isPlaying = currentTrack?.src === recording.arquivo_url;

  return (
    <>
      <motion.div layout className="p-4 bg-card/60 rounded-lg border border-border flex items-center justify-between space-x-4">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div className={`p-2 rounded-full ${color} bg-opacity-20`}>{icon}</div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">{recording.radios?.nome || 'Rádio desconhecida'}</p>
            <p className={`text-sm ${color}`}>{text}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 md:space-x-4">
          <div className="flex items-center space-x-2 text-muted-foreground">
            <Clock className="w-5 h-5 hidden sm:block" />
            <span className="font-mono text-sm w-20">
              {recording.status === 'gravando' ? formatTime(elapsed) : formatTime(recording.duracao_segundos || 0)}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            {recording.status === 'concluido' && (
              <>
                <Button size="icon" variant="ghost" onClick={() => isPlaying ? onStop() : onPlay(recording)} className={isPlaying ? 'text-orange-400 hover:text-orange-300' : 'text-primary hover:text-primary/80'}>
                    {isPlaying ? <Square className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>
                 <Button size="icon" variant="ghost" onClick={() => navigate(`/edicao-ia/${recording.id}`)} className="text-blue-400 hover:text-blue-300">
                    <Pencil className="w-5 h-5" />
                </Button>
              </>
            )}
             {(recording.status === 'gravando' || recording.status === 'parando') && onStopRecording && (
                <Button size="icon" variant="ghost" onClick={() => onStopRecording(recording.id)} disabled={recording.status === 'parando'} className="text-destructive hover:text-destructive/80">
                  <Square className="w-5 h-5" />
                </Button>
            )}
            {recording.status !== 'gravando' && recording.status !== 'iniciando' && recording.status !== 'parando' && (
               <Button size="icon" variant="ghost" onClick={() => setIsDeleteDialogOpen(true)} className="text-destructive hover:text-destructive/80">
                  <Trash2 className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>
      </motion.div>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente a gravação "{recording.arquivo_nome}" de nossos servidores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(recording.id, recording.user_id, recording.arquivo_nome)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default RecordingStatusCard;