
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Headphones, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import GravacaoItem from '@/components/gravacoes/GravacaoItem';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const GravacoesList = ({ gravacoes, setGravacoes, currentPlayingId, setCurrentPlayingId, setGlobalAudioTrack }) => {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleStopRecording = () => {
    setGlobalAudioTrack(null);
    setCurrentPlayingId(null);
  };

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    toast({ title: 'Excluindo gravações selecionadas...', description: 'Aguarde um momento.' });
    const { error } = await supabase.functions.invoke('delete-recordings-batch', {
      body: JSON.stringify({ gravacao_ids: Array.from(selectedIds) }),
    });
    if (error) toast({ title: "Erro ao excluir em lote", description: error.message, variant: 'destructive' });
    else {
      toast({ title: `${selectedIds.size} gravações excluídas com sucesso!`, variant: 'success' });
      setGravacoes(prev => prev.filter(g => !selectedIds.has(g.id)));
      if (selectedIds.has(currentPlayingId)) handleStopRecording();
      setSelectedIds(new Set());
    }
    setIsDeleting(false);
  };

  const toggleSelection = (id) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === gravacoes.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(gravacoes.map(g => g.id)));
  };

  const isAllSelected = useMemo(() => gravacoes.length > 0 && selectedIds.size === gravacoes.length, [gravacoes, selectedIds]);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-foreground flex items-center"><Headphones className="w-6 h-6 mr-3 text-accent" />Gravações Disponíveis</h2>
          <div className="flex items-center space-x-2">
            <Checkbox id="selectAll" checked={isAllSelected} onCheckedChange={toggleSelectAll} disabled={gravacoes.length === 0} />
            <label htmlFor="selectAll" className="text-sm font-medium text-muted-foreground cursor-pointer">Selecionar Todos</label>
          </div>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selectedIds.size} selecionada(s)</span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isDeleting}>
                  <Trash2 className="w-4 h-4 mr-2" /> Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirma exclusão?</AlertDialogTitle>
                  <AlertDialogDescription>Esta ação não pode ser desfeita. Excluirá {selectedIds.size} gravação(ões) permanentemente.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkDelete}>Sim, Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}><XCircle className="w-4 h-4 mr-2" /> Limpar</Button>
          </div>
        )}
      </div>
      {gravacoes.length === 0 ? (
        <div className="text-center py-12">
          <Headphones className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground text-lg">Nenhuma gravação encontrada.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {gravacoes.map((gravacao, index) => (
            <GravacaoItem
              key={gravacao.id}
              gravacao={gravacao}
              index={index}
              isSelected={selectedIds.has(gravacao.id)}
              onToggleSelection={toggleSelection}
              isPlaying={currentPlayingId === gravacao.id}
              onPlay={() => setCurrentPlayingId(gravacao.id)}
              onStop={() => setCurrentPlayingId(null)}
              setGlobalAudioTrack={setGlobalAudioTrack}
              onDelete={(id) => {
                setGravacoes(prev => prev.filter(g => g.id !== id));
                if (currentPlayingId === id) handleStopRecording();
              }}
            />
          ))}
        </div>
      )}
    </>
  );
};

export default GravacoesList;
