import React, { useState, useEffect, useCallback, useMemo } from 'react';

import { motion } from 'framer-motion';

import apiClient from '@/lib/apiClient';

import { useToast } from '@/components/ui/use-toast';
import { Helmet } from 'react-helmet';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate, useLocation } from 'react-router-dom';
import { Play, Pause, Download, Trash2, Clock, FileArchive, Mic, Filter, ListFilter, CalendarDays, MapPin, XCircle, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";


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

    <StatCard icon={<Mic className="w-12 h-12 text-primary mb-3" />} value={stats.totalGravacoes} unit="Gravações" delay={0.1} />

    <StatCard icon={<Clock className="w-12 h-12 text-blue-400 mb-3" />} value={(stats.totalDuration / 3600).toFixed(1)} unit="Horas Totais" delay={0.2} />

    <StatCard icon={<FileArchive className="w-12 h-12 text-green-400 mb-3" />} value={(stats.totalSize / 1024).toFixed(1)} unit="GB Totais" delay={0.3} />

    <StatCard icon={<Mic className="w-12 h-12 text-destructive mb-3" />} value={stats.uniqueRadios || stats.uniqueradios || 0} unit="Rádios gravadas" delay={0.4} />

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

          <label htmlFor="filterRadio" className="block text-sm font-medium text-muted-foreground mb-2">Filtrar por RaRadio</label>

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

  const [isDeleting, setIsDeleting] = useState(false);



  const handlePlay = () => {

    if (!gravacao.arquivo_url) {

      toast({ title: 'Audio indisponível', description: 'O arquivo desta gravação não foi encontrado.', variant: 'destructive' });

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

        subtitle: `${gravacao.radios?.cidade ? gravacao.radios.cidade + ' - ' : ''}Gravado em: ${format(new Date(gravacao.criado_em), "d 'de' MMMM, yyyy 'às' HH:mm", { locale: ptBR })}`,

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

      toast({ title: "Download Iniciado", description: "O arquivo de auRadio esta sendo baixado." });

    } catch (error) {

      toast({ title: "Erro no Download", description: error.message, variant: 'destructive' });

    }

  };



  const handleDelete = async () => {

    setIsDeleting(true);

    try {

      await apiClient.batchDeleteGravacoes([gravacao.id]);

      toast({ title: "Gravação excluída!", description: "A gravação foi removida com sucesso.", variant: "success" });

      onDelete(gravacao.id);

    } catch (error) {

      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });

    } finally {

      setIsDeleting(false);

    }

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

        <div className="flex flex-col">

          <span className="font-bold text-lg text-foreground truncate">{gravacao.radios?.nome || 'RaRadio Desconhecida'}</span>

          <span className="text-sm text-muted-foreground">

            {gravacao.radios?.cidade && <span>{gravacao.radios.cidade} - </span>}

            Gravado em: {format(new Date(gravacao.criado_em), "d MMM, yyyy 'às' HH:mm", { locale: ptBR })}

          </span>

        </div>

        <div className="flex items-center gap-6 text-sm">

          <div className="flex items-center gap-2 text-muted-foreground"><Clock className="w-4 h-4 text-blue-400" /><span>{formatDuration(gravacao.duracao_segundos)}</span></div>

          <div className="flex items-center gap-2 text-muted-foreground"><FileArchive className="w-4 h-4 text-green-400" /><span>{(gravacao.tamanho_mb || 0).toFixed(2)} MB</span></div>

          <div className="flex items-center gap-2 text-muted-foreground"><Mic className="w-4 h-4 text-purple-400" /><span>{gravacao.tipo || 'Manual'}</span></div>

        </div>

        <div className="flex items-center justify-end gap-2">

          <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${statusColors[gravacao.status] || statusColors.agendado}`}>{statusText[gravacao.status] || 'Desconhecido'}</span>

          <Button size="icon" variant="ghost" onClick={handleDownload} disabled={!gravacao.arquivo_url}><Download className="w-5 h-5" /></Button>

          <AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive hover:text-destructive-foreground hover:bg-destructive/90"><Trash2 className="w-5 h-5" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Você tem certeza?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita. Isso excluira permanentemente a gravação e todos os dados associados.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete} disabled={isDeleting}>{isDeleting ? 'Excluindo...' : 'Sim, Excluir'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

        </div>

      </div>

    </motion.div>

  );

};



const Gravacoes = ({ setGlobalAudioTrack }) => {

  const [gravacoes, setGravacoes] = useState([]);
  const [agendamentos, setAgendamentos] = useState([]);
  const [radios, setRadios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalGravacoes: 0, totalDuration: 0, totalSize: 0, uniqueRadios: 0 });
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);

  const initialRadioId = searchParams.get('radioId') || 'all';



  const [filters, setFilters] = useState({ radioId: initialRadioId, data: '', cidade: '', estado: '' });

  const [currentPlayingId, setCurrentPlayingId] = useState(null);

  const [selectedIds, setSelectedIds] = useState(new Set());

  const [isDeleting, setIsDeleting] = useState(false);

  const [activeTab, setActiveTab] = useState('all');

  const { toast } = useToast();



  const fetchRadios = useCallback(async () => {

    try {

      const data = await apiClient.getRadios();

      setRadios(data || []);

    } catch (error) {

      toast({ title: 'Erro ao buscar raRadios', description: error.message, variant: 'destructive' });

    }

  }, [toast]);



  const fetchGravacoes = useCallback(async () => {

    setLoading(true);

    try {
      const [gravData, agData] = await Promise.all([
        apiClient.getGravacoes({
          radioId: filters.radioId !== 'all' ? filters.radioId : undefined,
          data: filters.data,
          cidade: filters.cidade,
          estado: filters.estado,
        }),
        apiClient.getAgendamentos().catch(() => []),
        apiClient.getGravacoesStats(),
      ]);
      const statsData = gravData?.stats || (await apiClient.getGravacoesStats().catch(() => null));
      setGravacoes(gravData || []);
      setAgendamentos(agData || []);
      setStats(statsData || { totalGravacoes: 0, totalDuration: 0, totalSize: 0, uniqueRadios: 0 });
    } catch (error) {
      toast({ title: 'Erro ao buscar gravações', description: error.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [filters, toast]);


  useEffect(() => {

    fetchRadios();

  }, [fetchRadios]);



  useEffect(() => {

    fetchGravacoes();

  }, [fetchGravacoes]);



  const handlePlay = (id) => setCurrentPlayingId(id);

  const handleStop = () => setCurrentPlayingId(null);



  const handleDeleteSelected = async () => {

    if (selectedIds.size === 0) {

      toast({ title: 'Nenhuma gravação selecionada', description: 'Selecione pelo menos uma gravação para excluir.', variant: 'destructive' });

      return;

    }

    setIsDeleting(true);

    try {

      await apiClient.batchDeleteGravacoes(Array.from(selectedIds));

      toast({ title: 'Gravações excluídas', description: 'As gravações selecionadas foram removidas.' });

      setSelectedIds(new Set());

      fetchGravacoes();

    } catch (error) {

      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });

    } finally {

      setIsDeleting(false);

    }

  };



  const handleDeleteLocal = (id) => {

    setGravacoes((prev) => prev.filter((g) => g.id !== id));

    setSelectedIds((prev) => {

      const newSet = new Set(prev);

      newSet.delete(id);

      return newSet;

    });

  };



  const toggleSelection = (id) => {

    setSelectedIds((prev) => {

      const newSet = new Set(prev);

      if (newSet.has(id)) {

        newSet.delete(id);

      } else {

        newSet.add(id);

      }

      return newSet;

    });

  };



  const clearFilters = () => setFilters({ radioId: 'all', data: '', cidade: '', estado: '' });



  const agAsGravacoes = useMemo(() => {
    return agendamentos.map((ag) => ({
      id: `ag-${ag.id}`,
      radio_id: ag.radio_id,
      radios: radios.find((r) => r.id === ag.radio_id),
      criado_em: ag.data_inicio,
      status: ag.status || 'agendado',
      duracao_segundos: (ag.duracao_minutos || 0) * 60,
      tamanho_mb: 0,
      tipo: 'agendado',
      arquivo_url: null,
    }));
  }, [agendamentos, radios]);

  const filteredGravacoes = useMemo(() => [...agAsGravacoes, ...gravacoes], [agAsGravacoes, gravacoes]);
  const ongoingGravacoes = useMemo(

    () => filteredGravacoes.filter((g) => ['gravando', 'iniciando', 'processando'].includes(g.status)),

    [filteredGravacoes]

  );



  return (

    <>

      <Helmet>

        <title></title>

        <meta name="description" content="Visualize e gerencie suas gravacoes." />

      </Helmet>

      <div className="p-6 max-w-7xl mx-auto">

        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>

          <h1 className="text-4xl font-bold gradient-text">Gravacoes</h1>

          <p className="text-muted-foreground mt-2 text-lg">Gerencie todas as gravacoes realizadas pelo sistema.</p>

        </motion.div>



        <div className="mt-8">

          <div className="flex flex-wrap items-center gap-3 mb-6">

            <Button size="sm" variant={activeTab === 'all' ? 'default' : 'outline'} onClick={() => setActiveTab('all')}>

              Todas as gravacoes

            </Button>

            <Button size="sm" variant={activeTab === 'live' ? 'default' : 'outline'} onClick={() => setActiveTab('live')}> 

              Gravando agora

            </Button>

          </div>

          <GravacoesStats stats={stats} />

          <GravacoesFilter filters={filters} setFilters={setFilters} radios={radios} />



          <div className="flex items-center justify-between mb-4">

            <div className="text-sm text-muted-foreground">{filteredGravacoes.length} gravacoes encontradas</div>

            <div className="flex gap-2">

              <Button variant="outline" onClick={clearFilters} size="sm">Limpar filtros</Button>

              <Button variant="destructive" onClick={handleDeleteSelected} size="sm" disabled={selectedIds.size === 0 || isDeleting}>

                {isDeleting ? 'Excluindo...' : `Excluir Selecionadas (${selectedIds.size})`}

              </Button>

            </div>

          </div>



          {loading ? (

            <div className="flex justify-center items-center h-64">

              <Loader className="w-12 h-12 animate-spin text-cyan-400" />

            </div>

          ) : activeTab === 'live' ? (

            ongoingGravacoes.length === 0 ? (

              <div className="card text-center py-12">

                <XCircle className="w-16 h-16 text-slate-600 mx-auto mb-4" />

                <p className="text-muted-foreground">Nenhuma gravacao em andamento.</p>

              </div>

            ) : (

              <div className="bg-slate-900/80 border border-slate-800 rounded-lg overflow-hidden">

                {ongoingGravacoes.map((gravacao, idx) => (

                  <div

                    key={gravacao.id}

                    className={`px-4 py-3 flex items-center justify-between ${idx !== ongoingGravacoes.length - 1 ? 'border-b border-slate-800/80' : ''}`}

                  >

                    <div className="flex items-center gap-3">

                      <CircleDot className="w-4 h-4 text-red-400 animate-pulse" />

                      <div className="flex flex-col">

                        <span className="text-white font-semibold">{gravacao.radios?.nome || 'Radio'}</span>

                        <span className="text-xs text-slate-400">

                          Iniciada em {format(new Date(gravacao.criado_em), "d MMM 'as' HH:mm", { locale: ptBR })}

                        </span>

                      </div>

                    </div>

                    <span className="text-sm text-slate-300 px-3 py-1 rounded-full bg-slate-800 border border-slate-700">

                      {gravacao.status === 'gravando' ? 'Gravando' : 'Iniciando'}

                    </span>

                  </div>

                ))}

              </div>

            )

          ) : filteredGravacoes.length === 0 ? (

            <div className="card text-center py-12">

              <XCircle className="w-16 h-16 text-slate-600 mx-auto mb-4" />

              <h3 className="text-2xl font-bold text-white mb-2">Nenhuma gravacao encontrada</h3>

              <p className="text-muted-foreground">Ajuste os filtros ou realize novas gravacoes.</p>

            </div>

          ) : (

            <div className="space-y-4">

              {filteredGravacoes.map((gravacao, index) => (

                <GravacaoItem

                  key={gravacao.id}

                  gravacao={gravacao}

                  index={index}

                  isPlaying={currentPlayingId === gravacao.id}

                  onPlay={() => handlePlay(gravacao.id)}

                  onStop={handleStop}

                  setGlobalAudioTrack={setGlobalAudioTrack}

                  onDelete={handleDeleteLocal}

                  isSelected={selectedIds.has(gravacao.id)}

                  onToggleSelection={toggleSelection}

                />

              ))}

            </div>

          )}

        </div>

      </div>

    </>

  );

};



export default Gravacoes;
