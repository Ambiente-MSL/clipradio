import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Helmet } from 'react-helmet';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { Play, Pause, Download, Bot, Trash2, Clock, FileArchive, Mic, Headphones, Filter, ListFilter, CalendarDays, MapPin, XCircle, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useLocation } from 'react-router-dom';

const StatCard = ({ icon, value, unit, delay }) => (
  <motion.div 
    initial={{ opacity: 0, scale: 0.9 }} 
    animate={{ opacity: 1, scale: 1 }} 
    transition={{ delay }} 
    className="card flex flex-col items-center justify-center p-6 text-center"
  >
    {icon}
    <span className="text-4xl font-bold text-foreground">{value}</span>
    <span className="text-muted-foreground text-sm">{unit}</span>
  </motion.div>
);

const GravacoesStats = ({ stats }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
    <StatCard icon={<Headphones className="w-12 h-12 text-primary mb-3" />} value={stats.totalGravacoes} unit="Gravações" delay={0.1} />
    <StatCard icon={<Clock className="w-12 h-12 text-blue-400 mb-3" />} value={(stats.totalDuration / 3600).toFixed(1)} unit="Horas Totais" delay={0.2} />
    <StatCard icon={<FileArchive className="w-12 h-12 text-green-400 mb-3" />} value={(stats.totalSize / 1024).toFixed(1)} unit="GB Totais" delay={0.3} />
    <StatCard icon={<Headphones className="w-12 h-12 text-destructive mb-3" />} value={stats.uniqueRadios} unit="Rádios Gravadas" delay={0.4} />
  </div>
);

const GravacoesFilter = ({ filters, setFilters, radios }) => {
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="card p-6 mb-10">
      <h2 className="text-2xl font-bold text-foreground flex items-center mb-5"><Filter className="w-6 h-6 mr-3 text-purple-400" />Filtros</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div>
          <label htmlFor="filterRadio" className="block text-sm font-medium text-muted-foreground mb-2">Filtrar por Rádio</label>
          <div className="relative">
            <select id="filterRadio" name="radioId" className="input appearance-none pr-10" value={filters.radioId} onChange={handleFilterChange}>
              <option value="all">Todas as rádios</option>
              {radios.map((radio) => (
                <option key={radio.id} value={radio.id}>{radio.nome}</option>
              ))}
            </select>
            <ListFilter className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        <div>
          <label htmlFor="filterDate" className="block text-sm font-medium text-muted-foreground mb-2">Filtrar por Data</label>
          <div className="relative">
            <input id="filterDate" name="data" type="date" value={filters.data} onChange={handleFilterChange} className="input appearance-none pr-10" />
            <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        <div>
          <label htmlFor="filterCidade" className="block text-sm font-medium text-muted-foreground mb-2">Filtrar por Cidade</label>
          <div className="relative">
            <input id="filterCidade" name="cidade" type="text" placeholder="Digite a cidade..." value={filters.cidade} onChange={handleFilterChange} className="input pr-10" />
            <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        <div>
          <label htmlFor="filterEstado" className="block text-sm font-medium text-muted-foreground mb-2">Filtrar por Estado</label>
          <div className="relative">
            <input id="filterEstado" name="estado" type="text" placeholder="Digite o estado (UF)..." value={filters.estado} onChange={handleFilterChange} className="input pr-10" />
            <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

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
  
  const handleEditWithIA = () => navigate(`/edicao-ia/${gravacao.id}`);

  const statusColors = {
    concluido: 'bg-green-500/20 text-green-400 border-green-500/30',
    gravando: 'bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse',
    erro: 'bg-red-500/20 text-red-400 border-red-500/30',
    iniciando: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    agendado: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    processando: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30 animate-pulse',
  };
  const statusText = {
    concluido: 'Concluído', gravando: 'Gravando', erro: 'Erro', iniciando: 'Iniciando', agendado: 'Agendado', processando: 'Processando IA',
  };
  const formatDuration = (seconds) => {
    if (!seconds || seconds < 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -50, scale: 0.9 }} transition={{ duration: 0.5, delay: index * 0.05, type: 'spring', stiffness: 120 }} className={`card-item flex items-center p-4 gap-4 transition-all duration-300 ${isSelected ? 'bg-primary/10 border-primary' : 'border-transparent'}`}>
      <div className="flex items-center"><Checkbox checked={isSelected} onCheckedChange={() => onToggleSelection(gravacao.id)} className="mr-4" /><Button size="icon" variant="ghost" className="rounded-full w-14 h-14" onClick={handlePlay}>{isPlaying ? <Pause className="w-6 h-6 text-primary" /> : <Play className="w-6 h-6 text-primary" />}</Button></div>
      <div className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col"><span className="font-bold text-lg text-foreground truncate">{gravacao.radios?.nome || 'Rádio Desconhecida'}</span><span className="text-sm text-muted-foreground">{format(new Date(gravacao.criado_em), "d MMM, yyyy '•' HH:mm", { locale: ptBR })}</span></div>
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground"><Clock className="w-4 h-4 text-blue-400" /><span>{formatDuration(gravacao.duracao_segundos)}</span></div>
          <div className="flex items-center gap-2 text-muted-foreground"><FileArchive className="w-4 h-4 text-green-400" /><span>{(gravacao.tamanho_mb || 0).toFixed(2)} MB</span></div>
          <div className="flex items-center gap-2 text-muted-foreground"><Mic className="w-4 h-4 text-purple-400" /><span>{gravacao.tipo || 'Manual'}</span></div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${statusColors[gravacao.status] || statusColors.agendado}`}>{statusText[gravacao.status] || 'Desconhecido'}</span>
          <Button size="sm" variant="outline" onClick={handleEditWithIA}><Bot className="w-4 h-4 mr-2" /> Editar com IA</Button>
          <Button size="icon" variant="ghost" onClick={handleDownload} disabled={!gravacao.arquivo_url}><Download className="w-5 h-5" /></Button>
          <AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive hover:text-destructive-foreground hover:bg-destructive/90"><Trash2 className="w-5 h-5" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Você tem certeza?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita. Isso excluirá permanentemente a gravação e todos os dados associados, incluindo clipes de IA.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete} disabled={isDeleting}>{isDeleting ? 'Excluindo...' : 'Sim, Excluir'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        </div>
      </div>
    </motion.div>
  );
};

const Gravacoes = ({ setGlobalAudioTrack }) => {
  const [gravacoes, setGravacoes] = useState([]);
  const [radios, setRadios] = useState([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialRadioId = searchParams.get('radioId') || 'all';

  const [filters, setFilters] = useState({ radioId: initialRadioId, data: '', cidade: '', estado: '' });
  const [currentPlayingId, setCurrentPlayingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const { toast } = useToast();
  const { user } = useAuth();
  
  const fetchGravacoes = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    
    try {
      let query = supabase.from('gravacoes').select('*, radios(nome, cidade, estado)').eq('user_id', user.id);
      
      if (filters.radioId !== 'all') {
        query = query.eq('radio_id', filters.radioId);
      }
      
      if (filters.data) {
        try {
          const startOfDay = new Date(filters.data);
          const endOfDay = new Date(filters.data);
          
          startOfDay.setUTCHours(0, 0, 0, 0);
          endOfDay.setUTCHours(23, 59, 59, 999);
          
          query = query.gte('criado_em', startOfDay.toISOString()).lte('criado_em', endOfDay.toISOString());
        } catch (dateError) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('Erro na conversão de data do filtro:', dateError);
          }
          // Continue sem o filtro de data se houver erro
        }
      }
      
      if (filters.cidade) query = query.ilike('radios.cidade', `%${filters.cidade}%`);
      if (filters.estado) query = query.ilike('radios.estado', `%${filters.estado}%`);
      
      const { data, error } = await query.order('criado_em', { ascending: false });
      
      if (error) {
        toast({ title: "Erro ao buscar gravações", description: error.message, variant: "destructive" });
      } else {
        setGravacoes(data || []);
      }
    } catch (generalError) {
      toast({ 
        title: "Erro inesperado", 
        description: "Ocorreu um erro ao buscar as gravações. Tente novamente.", 
        variant: "destructive" 
      });
      if (process.env.NODE_ENV === 'development') {
        console.error('Erro geral em fetchGravacoes:', generalError);
      }
    } finally {
      setLoading(false);
    }
  }, [filters, user, toast]);

  const fetchRadios = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.from('radios').select('id, nome').eq('user_id', user.id);
    if (error) toast({ title: "Erro ao buscar rádios", description: error.message, variant: "destructive" });
    else setRadios(data || []);
  }, [user, toast]);

  useEffect(() => {
    if(user) fetchRadios();
    const handler = setTimeout(() => { fetchGravacoes(); }, 300);
    return () => clearTimeout(handler);
  }, [user, fetchRadios, fetchGravacoes]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('realtime-gravacoes').on('postgres_changes', { event: '*', schema: 'public', table: 'gravacoes', filter: `user_id=eq.${user.id}` }, payload => fetchGravacoes()).subscribe();
    return () => supabase.removeChannel(channel);
  }, [user, fetchGravacoes]);

  const stats = useMemo(() => ({
    totalGravacoes: gravacoes.length,
    totalDuration: gravacoes.reduce((sum, g) => sum + (g.duracao_segundos || 0), 0),
    totalSize: gravacoes.reduce((sum, g) => sum + (g.tamanho_mb || 0), 0),
    uniqueRadios: new Set(gravacoes.map(g => g.radio_id)).size,
  }), [gravacoes]);

  const toggleSelection = (id) => setSelectedIds(prev => { const newSet = new Set(prev); if (newSet.has(id)) newSet.delete(id); else newSet.add(id); return newSet; });
  const toggleSelectAll = () => setSelectedIds(selectedIds.size === gravacoes.length ? new Set() : new Set(gravacoes.map(g => g.id)));
  const isAllSelected = useMemo(() => gravacoes.length > 0 && selectedIds.size === gravacoes.length, [gravacoes, selectedIds]);

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    toast({ title: 'Excluindo gravações selecionadas...', description: 'Aguarde um momento.' });
    const { error } = await supabase.functions.invoke('delete-recordings-batch', { body: JSON.stringify({ gravacao_ids: Array.from(selectedIds) }) });
    if (error) toast({ title: "Erro ao excluir em lote", description: error.message, variant: 'destructive' });
    else {
      toast({ title: `${selectedIds.size} gravações excluídas com sucesso!`, variant: 'success' });
      setGravacoes(prev => prev.filter(g => !selectedIds.has(g.id)));
      if (Array.from(selectedIds).includes(currentPlayingId)) { setGlobalAudioTrack(null); setCurrentPlayingId(null); }
      setSelectedIds(new Set());
    }
    setIsDeleting(false);
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <Helmet><title>Gravações - IA Recorder</title><meta name="description" content="Gerencie e reproduza suas gravações de rádio." /></Helmet>
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-4xl font-bold gradient-text mb-2">Gerencie suas Gravações</h1>
          <p className="text-muted-foreground text-lg">Visualize, filtre e edite seus áudios com IA.</p>
        </motion.div>

        <GravacoesStats stats={stats} />
        <GravacoesFilter filters={filters} setFilters={setFilters} radios={radios} />

        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold text-foreground flex items-center"><Headphones className="w-6 h-6 mr-3 text-accent" />Gravações Disponíveis</h2>
              <div className="flex items-center space-x-2"><Checkbox id="selectAll" checked={isAllSelected} onCheckedChange={toggleSelectAll} disabled={gravacoes.length === 0} /><label htmlFor="selectAll" className="text-sm font-medium text-muted-foreground cursor-pointer">Selecionar Todos</label></div>
            </div>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{selectedIds.size} selecionada(s)</span>
                <AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" size="sm" disabled={isDeleting}><Trash2 className="w-4 h-4 mr-2" /> Excluir</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirma exclusão?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita. Excluirá {selectedIds.size} gravação(ões) permanentemente.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleBulkDelete}>Sim, Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                <Button variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}><XCircle className="w-4 h-4 mr-2" /> Limpar</Button>
              </div>
            )}
          </div>
          {loading ? (<div className="flex justify-center items-center h-48"><Loader className="w-8 h-8 animate-spin text-primary" /></div>)
            : gravacoes.length === 0 ? (<div className="text-center py-12"><Headphones className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" /><p className="text-muted-foreground text-lg">Nenhuma gravação encontrada para os filtros selecionados.</p></div>)
              : (<div className="space-y-4">{gravacoes.map((gravacao, index) => (<GravacaoItem key={gravacao.id} gravacao={gravacao} index={index} isSelected={selectedIds.has(gravacao.id)} onToggleSelection={toggleSelection} isPlaying={currentPlayingId === gravacao.id} onPlay={() => setCurrentPlayingId(gravacao.id)} onStop={() => setCurrentPlayingId(null)} setGlobalAudioTrack={setGlobalAudioTrack} onDelete={(id) => { setGravacoes(prev => prev.filter(g => g.id !== id)); if (currentPlayingId === id) { setGlobalAudioTrack(null); setCurrentPlayingId(null); } }} />))}</div>)}
        </motion.div>
      </div>
    </div>
  );
};

export default Gravacoes;