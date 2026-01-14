import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import { motion } from 'framer-motion';

import apiClient from '@/lib/apiClient';

import { useToast } from '@/components/ui/use-toast';
import { Helmet } from 'react-helmet';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLocation } from 'react-router-dom';
import { Play, Pause, Download, Trash2, Clock, FileArchive, FileText, Mic, Filter, ListFilter, CalendarDays, MapPin, XCircle, Loader, Square, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');

const resolveFileUrl = (url, filename) => {
  if (url) {
    if (/^(blob:|data:)/i.test(url)) return url;
    if (/^https?:/i.test(url)) {
      try {
        const parsed = new URL(url);
        const host = parsed.hostname;
        const apiHost = new URL(API_ORIGIN).hostname;
        const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
        if (!isLocalHost && host !== apiHost) {
          return url;
        }
        if (!filename) {
          return `${API_ORIGIN}${parsed.pathname}${parsed.search}`;
        }
      } catch (error) {
        return url;
      }
    }
  }
  if (filename) {
    return `${API_ORIGIN}/api/files/audio/${encodeURIComponent(filename)}`;
  }
  if (!url) return '';
  if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
  return `${API_ORIGIN}/${url}`;
};

const extractExtension = (value) => {
  const match = String(value || '').match(/\.([a-z0-9]+)(?:\?.*)?$/i);
  return match ? `.${match[1].toLowerCase()}` : '';
};

const buildDownloadName = (gravacao, audioUrl) => {
  const radioName = String(gravacao?.radios?.nome || 'gravacao');
  const createdAt = gravacao?.criado_em ? new Date(gravacao.criado_em) : null;
  const dateStamp = createdAt && !Number.isNaN(createdAt.getTime())
    ? format(createdAt, 'yyyy-MM-dd_HH-mm-ss')
    : 'sem-data';
  const rawBase = `${radioName}_${dateStamp}`;
  const normalized = rawBase.normalize ? rawBase.normalize('NFD') : rawBase;
  const safeBase = normalized
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'gravacao';
  const extension = extractExtension(audioUrl) || extractExtension(gravacao?.arquivo_nome) || '.mp3';
  return `${safeBase}${extension}`;
};

const buildTranscriptionDownloadName = (gravacao, audioUrl) => {
  const audioName = buildDownloadName(gravacao, audioUrl);
  const baseName = audioName.replace(/\.[^.]+$/, '');
  return `${baseName}.txt`;
};


const StatCard = ({ icon, value, unit, delay, gradient }) => (

  <motion.div

    initial={{ opacity: 0, scale: 0.9 }}

    animate={{ opacity: 1, scale: 1 }}

    transition={{ delay }}

    className={`relative overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br ${gradient} p-6 shadow-xl flex flex-col items-center justify-center text-center`}

  >

    {icon}

    <span className="text-4xl font-bold text-white">{value}</span>

    <span className="text-slate-300 text-sm">{unit}</span>

    <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-white/5 via-transparent to-transparent" />

  </motion.div>

);

const formatTotalDuration = (totalSeconds) => {
  const totalMinutes = Math.floor((totalSeconds || 0) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
};



const GravacoesStats = ({ stats }) => (

  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">

    <StatCard icon={<Mic className="w-12 h-12 text-cyan-300 mb-3" />} value={stats.totalGravacoes} unit="Gravações" delay={0.1} gradient="from-cyan-600/50 via-cyan-500/30 to-slate-900" />

    <StatCard icon={<Clock className="w-12 h-12 text-emerald-300 mb-3" />} value={formatTotalDuration(stats.totalDuration)} unit="Horas Totais" delay={0.2} gradient="from-emerald-600/50 via-emerald-500/30 to-slate-900" />

    <StatCard icon={<FileArchive className="w-12 h-12 text-amber-300 mb-3" />} value={(stats.totalSize / 1024).toFixed(1)} unit="GB Totais" delay={0.3} gradient="from-amber-600/40 via-amber-500/20 to-slate-900" />

    <StatCard icon={<Mic className="w-12 h-12 text-fuchsia-300 mb-3" />} value={stats.uniqueRadios || stats.uniqueradios || 0} unit="Rádios gravadas" delay={0.4} gradient="from-fuchsia-600/40 via-fuchsia-500/20 to-slate-900" />

  </div>

);

const GravacoesFilter = ({ filters, setFilters, radios, estadoOptions, cidadeOptions }) => {
  const dateInputRef = useRef(null);

  const handleFilterChange = (e) => {

    const { name, value } = e.target;

    setFilters(prev => ({ ...prev, [name]: value }));

  };

  const handleDatePickerClick = () => {
    const input = dateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.focus();
    }
  };


  return (

    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="card p-6 mb-10">

      <h2 className="text-2xl font-bold text-foreground flex items-center mb-5"><Filter className="w-6 h-6 mr-3 text-purple-400" />Filtros</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

        <div>

          <label htmlFor="filterEstado" className="block text-sm font-medium text-muted-foreground mb-2">Filtrar por estado</label>

          <div className="relative">

            <select id="filterEstado" name="estado" className="input appearance-none pr-10" value={filters.estado} onChange={handleFilterChange}>
              <option value="">Todos os estados</option>
              {estadoOptions.map((estado) => (
                <option key={estado} value={estado}>{estado}</option>
              ))}
            </select>

            <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />

          </div>

        </div>

        <div>

          <label htmlFor="filterCidade" className="block text-sm font-medium text-muted-foreground mb-2">Filtrar por cidade</label>

          <div className="relative">

            <select id="filterCidade" name="cidade" className="input appearance-none pr-10" value={filters.cidade} onChange={handleFilterChange}>
              <option value="">Todas as cidades</option>
              {cidadeOptions.map((cidade) => (
                <option key={cidade} value={cidade}>{cidade}</option>
              ))}
            </select>

            <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />

          </div>

        </div>

        <div>

          <label htmlFor="filterRadio" className="block text-sm font-medium text-muted-foreground mb-2">Filtrar por rádio</label>

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

          <label htmlFor="filterDate" className="block text-sm font-medium text-muted-foreground mb-2">Filtrar por data</label>

          <div className="relative cursor-pointer" onClick={handleDatePickerClick}>

            <input
              ref={dateInputRef}
              id="filterDate"
              name="data"
              type="date"
              value={filters.data}
              onChange={handleFilterChange}
              className="input appearance-none pr-10"
            />

            <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />

          </div>

        </div>

      </div>

      </motion.div>

  );

};



const GravacaoItem = ({ gravacao, index, isPlaying, onPlay, onStop, setGlobalAudioTrack, onDelete, isSelected, onToggleSelection }) => {

  const { toast } = useToast();

  const [isDeleting, setIsDeleting] = useState(false);
  const [isTranscriptionOpen, setIsTranscriptionOpen] = useState(false);
  const [isTranscriptionLoading, setIsTranscriptionLoading] = useState(false);
  const [transcriptionData, setTranscriptionData] = useState({
    status: gravacao?.transcricao_status || null,
    texto: gravacao?.transcricao_texto || '',
    erro: gravacao?.transcricao_erro || null,
    progresso: gravacao?.transcricao_progresso ?? 0,
  });
  const [transcriptionStartedAt, setTranscriptionStartedAt] = useState(null);
  const [transcriptionFinishedAt, setTranscriptionFinishedAt] = useState(null);
  const [transcriptionLastUpdateAt, setTranscriptionLastUpdateAt] = useState(null);
  const [transcriptionNow, setTranscriptionNow] = useState(Date.now());

  useEffect(() => {
    setTranscriptionData((prev) => ({
      ...prev,
      status: gravacao?.transcricao_status ?? prev.status,
      erro: gravacao?.transcricao_erro ?? prev.erro,
      texto: prev.texto || gravacao?.transcricao_texto || '',
      progresso: gravacao?.transcricao_progresso ?? prev.progresso ?? 0,
    }));
  }, [gravacao?.transcricao_status, gravacao?.transcricao_erro, gravacao?.transcricao_texto, gravacao?.transcricao_progresso]);



  const handlePlay = () => {

    if (!gravacao.arquivo_url) {

      toast({ title: 'Audio indisponível', description: 'O arquivo desta gravação não foi encontrado.', variant: 'destructive' });

      return;

    }

    if (isPlaying) {

      onStop();

      setGlobalAudioTrack(null);

    } else {

      const audioUrl = resolveFileUrl(gravacao.arquivo_url, gravacao.arquivo_nome);
      onPlay();

      setGlobalAudioTrack({

        src: audioUrl,

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

      const audioUrl = resolveFileUrl(gravacao.arquivo_url, gravacao.arquivo_nome);
      if (!audioUrl) {
        toast({ title: "Download indisponÇðvel", description: "O arquivo desta gravação não foi encontrado.", variant: 'destructive' });
        return;
      }
      const response = await fetch(audioUrl);

      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);

      const a = document.createElement('a');

      a.style.display = 'none';

      a.href = url;
      const downloadName = buildDownloadName(gravacao, audioUrl);
      a.download = downloadName;

      document.body.appendChild(a);

      a.click();

      window.URL.revokeObjectURL(url);

      toast({ title: "Download Iniciado", description: "O arquivo de áudio esta sendo baixado." });

    } catch (error) {

      toast({ title: "Erro no Download", description: error.message, variant: 'destructive' });

    }

  };

  const markTranscriptionStart = () => {
    const now = Date.now();
    setTranscriptionStartedAt(now);
    setTranscriptionFinishedAt(null);
    setTranscriptionLastUpdateAt(now);
    setTranscriptionNow(now);
  };

  const applyTranscriptionUpdate = (data) => {
    setTranscriptionData((prev) => {
      const next = {
        ...prev,
        status: data?.status ?? prev.status ?? null,
        texto: data?.texto ?? prev.texto ?? '',
        erro: data?.erro ?? prev.erro ?? null,
        progresso: data?.progresso ?? prev.progresso ?? 0,
      };
      const changed = next.status !== prev.status || next.texto !== prev.texto || next.erro !== prev.erro || next.progresso !== prev.progresso;
      if (changed) {
        setTranscriptionLastUpdateAt(Date.now());
      }
      return next;
    });
  };

  const handleToggleTranscription = async () => {
    if (isTranscriptionOpen) {
      setIsTranscriptionOpen(false);
      setIsTranscriptionLoading(false);
      return;
    }

    if (!gravacao?.arquivo_url) {
      toast({ title: 'Transcrição indisponível', description: 'O arquivo desta gravação não foi encontrado.', variant: 'destructive' });
      return;
    }

    if (!gravacao?.id) return;
    setIsTranscriptionOpen(true);

    setIsTranscriptionLoading(true);
    try {
      const data = await apiClient.getTranscricao(gravacao.id);
      applyTranscriptionUpdate(data);
    } catch (error) {
      toast({ title: 'Erro ao carregar transcrição', description: error.message, variant: 'destructive' });
    } finally {
      setIsTranscriptionLoading(false);
    }
  };



  const handleStartTranscription = async () => {
    if (!gravacao?.arquivo_url) {
      toast({ title: 'Transcrição indisponível', description: 'O arquivo desta gravação não foi encontrado.', variant: 'destructive' });
      return;
    }

    if (!gravacao?.id) return;

    setIsTranscriptionOpen(true);
    setIsTranscriptionLoading(true);
    try {
      const data = await apiClient.getTranscricao(gravacao.id);
      applyTranscriptionUpdate(data);

      if (gravacao.status !== 'concluido') {
        toast({ title: 'Transcrição indisponível', description: 'A transcrição fica disponível após a gravação concluir.' });
        return;
      }

      if (['processando', 'fila', 'interrompendo'].includes(data?.status)) {
        toast({ title: 'Transcrição em andamento', description: 'Aguarde a conclusão ou use Parar para interromper.' });
        return;
      }

      if (data?.texto && data?.status === 'concluido') {
        toast({ title: 'Transcrição já concluída', description: 'Use Reprocessar se quiser gerar novamente.' });
        return;
      }

      markTranscriptionStart();

      const started = await apiClient.startTranscricao(gravacao.id, { force: false });
      setTranscriptionData((prev) => ({
        ...prev,
        status: started?.status || 'processando',
        progresso: prev.progresso ?? 0,
      }));
    } catch (error) {
      toast({ title: 'Erro ao iniciar transcrição', description: error.message, variant: 'destructive' });
    } finally {
      setIsTranscriptionLoading(false);
    }
  };

  const handleReprocessTranscription = async () => {
    if (!gravacao?.arquivo_url) {
      toast({ title: 'Transcrição indisponível', description: 'O arquivo desta gravação não foi encontrado.', variant: 'destructive' });
      return;
    }

    if (!gravacao?.id) return;

    setIsTranscriptionOpen(true);
    setIsTranscriptionLoading(true);
    try {
      if (gravacao.status !== 'concluido') {
        toast({ title: 'Transcrição indisponível', description: 'A transcrição fica disponível após a gravação concluir.' });
        return;
      }

      markTranscriptionStart();

      const started = await apiClient.startTranscricao(gravacao.id, { force: true });
      setTranscriptionData((prev) => ({
        ...prev,
        status: started?.status || 'processando',
        texto: '',
        erro: null,
        progresso: 0,
      }));
    } catch (error) {
      toast({ title: 'Erro ao reprocessar transcrição', description: error.message, variant: 'destructive' });
    } finally {
      setIsTranscriptionLoading(false);
    }
  };

  const handleDownloadTranscription = () => {
    if (!transcriptionData.texto) {
      toast({ title: 'Transcrição vazia', description: 'Nenhum texto para baixar ainda.' });
      return;
    }
    const audioUrl = resolveFileUrl(gravacao.arquivo_url, gravacao.arquivo_nome);
    const filename = buildTranscriptionDownloadName(gravacao, audioUrl);
    const blob = new Blob([transcriptionData.texto], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    toast({ title: 'Download iniciado', description: 'O texto da transcrição está sendo baixado.' });
  };

  const handleCopyTranscription = async () => {
    if (!transcriptionData.texto) {
      toast({ title: 'Transcrição vazia', description: 'Nenhum texto para copiar ainda.' });
      return;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(transcriptionData.texto);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = transcriptionData.texto;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      toast({ title: 'Transcrição copiada', description: 'Texto copiado para a área de transferência.' });
    } catch (error) {
      toast({ title: 'Erro ao copiar transcrição', description: error.message, variant: 'destructive' });
    }
  };
  const handleStopTranscription = async () => {
    if (!gravacao?.id) return;
    applyTranscriptionUpdate({ status: 'interrompendo' });
    try {
      const data = await apiClient.stopTranscricao(gravacao.id);
      applyTranscriptionUpdate(data);
    } catch (error) {
      toast({ title: 'Erro ao parar transcricao', description: error.message, variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (!transcriptionStartedAt && !transcriptionLastUpdateAt) return;
    if (transcriptionFinishedAt) {
      setTranscriptionNow(transcriptionFinishedAt);
      return;
    }
    const timer = setInterval(() => setTranscriptionNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [transcriptionStartedAt, transcriptionLastUpdateAt, transcriptionFinishedAt]);

  useEffect(() => {
    if (!transcriptionStartedAt || transcriptionFinishedAt) return;
    if (['concluido', 'erro', 'interrompido'].includes(transcriptionData.status)) {
      setTranscriptionFinishedAt(Date.now());
    }
  }, [transcriptionData.status, transcriptionStartedAt, transcriptionFinishedAt]);

  useEffect(() => {
    if (!isTranscriptionOpen) return;
    if (!gravacao?.id) return;
    if (!['processando', 'interrompendo', 'fila'].includes(transcriptionData.status)) return;
    let active = true;
    const fetchStatus = async () => {
      try {
        const data = await apiClient.getTranscricao(gravacao.id);
        if (!active) return;
        applyTranscriptionUpdate(data);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Erro ao atualizar transcricao', error);
        }
      }
    };
    fetchStatus();
    const timer = setInterval(fetchStatus, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isTranscriptionOpen, transcriptionData.status, gravacao?.id]);



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

  const progressValue = Math.min(100, Math.max(0, Number(transcriptionData.progresso || 0)));
  const timerNow = transcriptionFinishedAt || transcriptionNow;
  const elapsedSeconds = transcriptionStartedAt
    ? Math.max(0, Math.floor((timerNow - transcriptionStartedAt) / 1000))
    : null;
  const idleSeconds = transcriptionLastUpdateAt
    ? Math.max(0, Math.floor((timerNow - transcriptionLastUpdateAt) / 1000))
    : null;
  const elapsedLabel = elapsedSeconds !== null ? formatDuration(elapsedSeconds) : '--:--';
  const idleLabel = idleSeconds !== null ? formatDuration(idleSeconds) : '--:--';
  const isStalled = idleSeconds !== null
    && idleSeconds >= 90
    && ['processando', 'fila'].includes(transcriptionData.status);
  return (

    <motion.div layout="position" initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -50, scale: 0.9 }} transition={{ duration: 0.5, delay: index * 0.05, type: 'spring', stiffness: 120 }} className={`card-item flex flex-col p-4 gap-4 transition-colors duration-200 ${isSelected ? 'bg-primary/10 border-primary' : 'border-transparent'}`}>

      <div className="flex items-center w-full gap-4">

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

        <div className="flex flex-wrap items-center justify-end gap-2">

          <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${statusColors[gravacao.status] || statusColors.agendado}`}>{statusText[gravacao.status] || 'Desconhecido'}</span>

          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={handleDownload} disabled={!gravacao.arquivo_url}><Download className="w-5 h-5" /></Button>
          <Button size="sm" variant="outline" onClick={handleStartTranscription} disabled={!gravacao.arquivo_url}>
            <FileText className="w-4 h-4 mr-2" />
            Transcrever
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            onClick={handleToggleTranscription}
            disabled={!gravacao.arquivo_url && !isTranscriptionOpen}
            title={isTranscriptionOpen ? 'Recolher transcricao' : 'Abrir transcricao'}
          >
            {isTranscriptionOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </Button>


          <AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="h-9 w-9 text-destructive hover:text-destructive-foreground hover:bg-destructive/90"><Trash2 className="w-5 h-5" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Você tem certeza?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita. Isso excluira permanentemente a gravação e todos os dados associados.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete} disabled={isDeleting}>{isDeleting ? 'Excluindo...' : 'Sim, Excluir'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

        </div>

      </div>

      </div>

      {isTranscriptionOpen && (
        <div className="w-full rounded-lg border border-slate-800/70 bg-slate-950/40 p-4 text-sm text-slate-200">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={handleStartTranscription}
              disabled={isTranscriptionLoading || gravacao.status !== 'concluido'}
            >
              Transcrever
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleReprocessTranscription}
              disabled={isTranscriptionLoading || gravacao.status !== 'concluido'}
            >
              Reprocessar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleStopTranscription}
              disabled={isTranscriptionLoading || !['processando', 'fila'].includes(transcriptionData.status)}
            >
              Parar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadTranscription}
              disabled={!transcriptionData.texto}
            >
              Baixar texto
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyTranscription}
              disabled={!transcriptionData.texto}
            >
              Copiar transcrição
            </Button>
            </div>
            <div className="text-xs text-muted-foreground lg:ml-auto">
              Progresso: {progressValue}% | Tempo percorrido: {elapsedLabel} | Ultima atualizacao: {idleLabel}
            </div>
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-slate-800/80 overflow-hidden">
            <div className="h-full bg-emerald-400 transition-all duration-300" style={{ width: `${progressValue}%` }} />
          </div>
          <div className="mt-4 rounded-md bg-slate-900/60 p-3 max-h-60 overflow-y-auto">
            {transcriptionData.status === 'interrompendo' ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader className="w-4 h-4 animate-spin" />
                Parando transcrição...
              </div>
            ) : transcriptionData.texto ? (
              <p className="whitespace-pre-wrap leading-relaxed">{transcriptionData.texto}</p>
            ) : isTranscriptionLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader className="w-4 h-4 animate-spin" />
                Carregando transcrição...
              </div>
            ) : transcriptionData.status === 'fila' ? (
              <div className="text-muted-foreground">Transcricao na fila. Tempo na fila: {elapsedLabel}. Ultima atualizacao: {idleLabel}.</div>
            ) : transcriptionData.status === 'processando' ? (
              isStalled ? (
                <div className="text-amber-300">Sem atualizacao ha {idleLabel}. Voce pode reprocessar.</div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader className="w-4 h-4 animate-spin" />
                  Transcricao em processamento... Ultima atualizacao: {idleLabel}
                </div>
              )
            ) : transcriptionData.status === 'interrompido' ? (
              <div className="text-muted-foreground">Transcrição interrompida.</div>
            ) : transcriptionData.status === 'erro' ? (
              <div className="text-destructive">
                Falha ao transcrever. {transcriptionData.erro ? `Motivo: ${transcriptionData.erro}` : ''}
              </div>
            ) : gravacao.status !== 'concluido' ? (
              <div className="text-muted-foreground">Transcrição disponível após a conclusão.</div>
            ) : (
              <div className="text-muted-foreground">Transcrição pendente. Clique novamente para atualizar.</div>
            )}
          </div>
        </div>
      )}

    </motion.div>

  );

};



const Gravacoes = ({ setGlobalAudioTrack }) => {

  const [gravacoes, setGravacoes] = useState([]);
  const [agendamentos, setAgendamentos] = useState([]);
  const [radios, setRadios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalGravacoes: 0, totalDuration: 0, totalSize: 0, uniqueRadios: 0 });
  const ITEMS_PER_PAGE = 10;
  const [listMeta, setListMeta] = useState({ page: 1, per_page: ITEMS_PER_PAGE, total: 0, total_pages: 0 });
  const [ongoingLive, setOngoingLive] = useState([]);
  const [loadingOngoing, setLoadingOngoing] = useState(false);
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);

  const initialRadioId = searchParams.get('radioId') || 'all';

  const [filters, setFilters] = useState({ radioId: initialRadioId, data: '', cidade: '', estado: '' });
  const [currentPlayingId, setCurrentPlayingId] = useState(null);

  useEffect(() => {
    const handleGlobalAudioClosed = () => setCurrentPlayingId(null);
    window.addEventListener('global-audio-closed', handleGlobalAudioClosed);
    return () => window.removeEventListener('global-audio-closed', handleGlobalAudioClosed);
  }, []);

  const estadoOptions = useMemo(() => {
    const estadoSet = new Set();
    radios.forEach((radio) => {
      if (radio.estado) {
        estadoSet.add(radio.estado.toUpperCase());
      }
    });
    return Array.from(estadoSet).sort();
  }, [radios]);

  const cidadeOptions = useMemo(() => {
    const cidadeSet = new Set();
    radios.forEach((radio) => {
      if (!radio.cidade) return;
      if (filters.estado) {
        const radioEstado = (radio.estado || '').toUpperCase();
        if (radioEstado !== filters.estado.toUpperCase()) {
          return;
        }
      }
      cidadeSet.add(radio.cidade);
    });
    return Array.from(cidadeSet).sort((a, b) => a.localeCompare(b));
  }, [radios, filters.estado]);

  const [selectedIds, setSelectedIds] = useState(new Set());

  const [isDeleting, setIsDeleting] = useState(false);

  const [activeTab, setActiveTab] = useState('all');
  const [stoppingId, setStoppingId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

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
      const statusFilter = activeTab === 'all' || activeTab === 'agendados' || activeTab === 'manuais'
        ? 'concluido'
        : undefined;
      const tipoFilter = activeTab === 'agendados'
        ? 'agendado'
        : activeTab === 'manuais'
          ? 'manual'
          : undefined;
      const [gravResp, agData] = await Promise.all([
        apiClient.getGravacoes({
          radioId: filters.radioId !== 'all' ? filters.radioId : undefined,
          data: filters.data,
          cidade: filters.cidade,
          estado: filters.estado,
          status: statusFilter,
          tipo: tipoFilter,
          page: currentPage,
          perPage: ITEMS_PER_PAGE,
          includeStats: true,
        }),
        apiClient.getAgendamentos().catch(() => []),
      ]);

      const gravList = gravResp?.items || [];
      const statsData = gravResp?.stats;
      const metaData = gravResp?.meta;

      setGravacoes(gravList || []);
      setAgendamentos(agData || []);
      setStats(statsData || { totalGravacoes: 0, totalDuration: 0, totalSize: 0, uniqueRadios: 0 });
      setListMeta(metaData || { page: currentPage, per_page: ITEMS_PER_PAGE, total: gravList.length, total_pages: gravList.length ? 1 : 0 });
      if (metaData?.page && metaData.page !== currentPage) {
        setCurrentPage(metaData.page);
      }
    } catch (error) {
      toast({ title: 'Erro ao buscar gravações', description: error.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [activeTab, currentPage, filters, toast]);


  useEffect(() => {

    fetchRadios();

  }, [fetchRadios]);

  useEffect(() => {
    if (!filters.cidade) return;
    if (cidadeOptions.includes(filters.cidade)) return;
    setFilters((prev) => ({ ...prev, cidade: '' }));
  }, [cidadeOptions, filters.cidade, setFilters]);



  useEffect(() => {

    fetchGravacoes();

  }, [fetchGravacoes]);

  useEffect(() => {
    let timer;
    const fetchOngoing = async () => {
      setLoadingOngoing(true);
      try {
        const data = await apiClient.getOngoingRecordings();
        setOngoingLive(data || []);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Erro ao buscar gravações em andamento', error);
        }
      } finally {
        setLoadingOngoing(false);
      }
    };
    fetchOngoing();
    timer = setInterval(fetchOngoing, 5000);
    return () => clearInterval(timer);
  }, []);



  const handlePlay = (id) => setCurrentPlayingId(id);

  const handleStop = () => setCurrentPlayingId(null);

  const handleStopRecording = async (gravacao) => {
    if (!gravacao?.id) return;
    const idStr = String(gravacao.id);
    if (idStr.startsWith('ag-')) {
      toast({ title: 'Nao e possivel parar', description: 'Agendamentos nao podem ser parados manualmente.', variant: 'destructive' });
      return;
    }
    if (!['gravando', 'iniciando', 'processando'].includes(gravacao.status)) {
      toast({ title: 'Gravacao nao esta em andamento', description: 'Apenas gravações ativas podem ser paradas.', variant: 'destructive' });
      return;
    }
    setStoppingId(gravacao.id);
    try {
      await apiClient.stopRecording(gravacao.id);
      toast({ title: 'Gravação parada', description: `${gravacao.radios?.nome || 'Gravação'} foi interrompida.` });
      setGravacoes((prev) => prev.map((g) => (g.id === gravacao.id ? { ...g, status: 'concluido' } : g)));
      setOngoingLive((prev) => prev.filter((g) => g.id !== gravacao.id));
      fetchGravacoes();
    } catch (error) {
      toast({ title: 'Erro ao parar', description: error.message, variant: 'destructive' });
    } finally {
      setStoppingId(null);
    }
  };

  const getOngoingStatus = (gravacao) => {
    switch (gravacao.status) {
      case 'iniciando':
        return { label: 'Gravando', className: 'bg-red-500/15 border-red-500/40 text-red-200 animate-pulse' };
      case 'gravando':
        return { label: 'Gravando', className: 'bg-red-500/15 border-red-500/40 text-red-200 animate-pulse' };
      case 'processando':
        return { label: 'Processando', className: 'bg-indigo-500/15 border-indigo-500/40 text-indigo-200 animate-pulse' };
      case 'concluido':
        return { label: 'Concluida', className: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200' };
      default:
        return { label: gravacao.status || 'Desconhecido', className: 'bg-slate-700/40 border-slate-600 text-slate-200' };
    }
  };



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
      transcricao_status: null,
      transcricao_disponivel: false,
      transcricao_erro: null,
      transcricao_progresso: 0,
      transcricao_cancelada: false,
    }));
  }, [agendamentos, radios]);

  const filteredGravacoes = useMemo(() => {
    const combined = [...agAsGravacoes, ...gravacoes];
    // Ordenar por data mais recente primeiro
    return combined.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  }, [agAsGravacoes, gravacoes]);

  const concludedGravacoes = useMemo(
    () => filteredGravacoes.filter((gravacao) => String(gravacao.status || '').toLowerCase() === 'concluido'),
    [filteredGravacoes]
  );
  const scheduledGravacoes = useMemo(
    () =>
      concludedGravacoes.filter((gravacao) => {
        const tipo = String(gravacao.tipo || '').toLowerCase();
        return tipo === 'agendado';
      }),
    [concludedGravacoes]
  );
  const manualGravacoes = useMemo(
    () =>
      concludedGravacoes.filter((gravacao) => {
        const tipo = String(gravacao.tipo || 'manual').toLowerCase();
        return tipo === 'manual';
      }),
    [concludedGravacoes]
  );
  const ongoingGravacoes = useMemo(
    () => ongoingLive.map((g) => ({
      ...g,
      radios: g.radios || radios.find((r) => r.id === g.radio_id),
    })),
    [ongoingLive, radios]
  );

  const totalCount = activeTab === 'live'
    ? ongoingGravacoes.length
    : (listMeta.total || 0);

  // Paginação
  const getCurrentPageItems = (items) => items;

  const totalPages = activeTab === 'live'
    ? Math.ceil(totalCount / ITEMS_PER_PAGE)
    : (listMeta.total_pages || 0);
  const canPrevPage = currentPage > 1;
  const canNextPage = totalPages ? currentPage < totalPages : false;

  const paginatedScheduled = useMemo(() => getCurrentPageItems(scheduledGravacoes), [scheduledGravacoes]);
  const paginatedManual = useMemo(() => getCurrentPageItems(manualGravacoes), [manualGravacoes]);
  const paginatedConcluded = useMemo(() => getCurrentPageItems(concludedGravacoes), [concludedGravacoes]);

  // Resetar página quando mudar de aba ou filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, filters]);

  const PaginationControls = () => (
    <div className="flex items-center justify-between text-sm text-muted-foreground py-3 px-4 bg-slate-900/40 rounded-lg border border-slate-800">
      <span>
        Página {currentPage} de {totalPages} • {totalCount} gravações
      </span>
      <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          disabled={!canPrevPage}
          title="Página anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
          disabled={!canNextPage}
          title="Próxima página"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );

  return (

    <>

      <Helmet>

        <title></title>

        <meta name="description" content="Visualize e gerencie suas gravações." />

      </Helmet>

      <div className="p-6 max-w-7xl mx-auto">

        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>

          <h1 className="text-4xl font-bold gradient-text">Gravações</h1>

          <p className="text-muted-foreground mt-2 text-lg">Gerencie todas as gravações realizadas pelo sistema.</p>

        </motion.div>



        <div className="mt-8">

          <div className="flex flex-wrap items-center gap-3 mb-6">

            <Button size="sm" variant={activeTab === 'all' ? 'default' : 'outline'} onClick={() => setActiveTab('all')}>

              Todas as gravações

            </Button>

            <Button size="sm" variant={activeTab === 'live' ? 'default' : 'outline'} onClick={() => setActiveTab('live')}> 

              Gravando agora

            </Button>

            <Button size="sm" variant={activeTab === 'agendados' ? 'default' : 'outline'} onClick={() => setActiveTab('agendados')}>

              Agendados

            </Button>

            <Button size="sm" variant={activeTab === 'manuais' ? 'default' : 'outline'} onClick={() => setActiveTab('manuais')}>

              Manuais

            </Button>

          </div>

          <GravacoesStats stats={stats} />

          <GravacoesFilter
            filters={filters}
            setFilters={setFilters}
            radios={radios}
            estadoOptions={estadoOptions}
            cidadeOptions={cidadeOptions}
          />



          <div className="flex items-center justify-end mb-4 gap-2">

            <Button variant="outline" onClick={clearFilters} size="sm">Limpar filtros</Button>

            <Button variant="destructive" onClick={handleDeleteSelected} size="sm" disabled={selectedIds.size === 0 || isDeleting}>

              {isDeleting ? 'Excluindo...' : `Excluir Selecionadas (${selectedIds.size})`}

            </Button>

          </div>



          {loading ? (

            <div className="flex justify-center items-center h-64">

              <Loader className="w-12 h-12 animate-spin text-cyan-400" />

            </div>

          ) : activeTab === 'live' ? (

            ongoingGravacoes.length === 0 ? (

              <div className="card text-center py-12">

                <XCircle className="w-16 h-16 text-slate-600 mx-auto mb-4" />

                <p className="text-muted-foreground">Nenhuma gravação em andamento.</p>

              </div>

            ) : (

              <div className="bg-slate-900/80 border border-slate-800 rounded-lg overflow-hidden">
                {loadingOngoing && (
                  <div className="px-4 py-2 text-xs text-slate-400">Atualizando gravações em tempo real...</div>
                )}

                {ongoingGravacoes.map((gravacao, idx) => {
                  const statusInfo = getOngoingStatus(gravacao);
                  const canStop = ['gravando', 'iniciando', 'processando'].includes(gravacao.status);
                  const tipoLabel = gravacao.tipo === 'agendado' ? 'Agendado' : gravacao.tipo === 'manual' ? 'Manual' : gravacao.tipo || 'Outro';
                  return (

                    <div
                      key={gravacao.id}
                      className={`px-4 py-3 flex items-center justify-between ${idx !== ongoingGravacoes.length - 1 ? 'border-b border-slate-800/80' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <span className="text-white font-semibold">{gravacao.radios?.nome || 'Radio'}</span>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span>Iniciada em {format(new Date(gravacao.criado_em), "d MMM 'às' HH:mm", { locale: ptBR })}</span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-200 uppercase tracking-wide">
                              {tipoLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {canStop && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 px-3"
                            onClick={() => handleStopRecording(gravacao)}
                            disabled={stoppingId === gravacao.id}
                          >
                            {stoppingId === gravacao.id ? (
                              <>
                                <Loader className="w-3.5 h-3.5 mr-1 animate-spin" />
                                Parando...
                              </>
                            ) : (
                              <>
                                <Square className="w-3.5 h-3.5 mr-1" />
                                Parar
                              </>
                            )}
                          </Button>
                        )}
                        <span className={`text-sm px-3 py-1 rounded-full border ${statusInfo.className}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                    </div>

                  );
                })}


              </div>

            )

          
          ) : activeTab === 'agendados' ? (

            scheduledGravacoes.length === 0 ? (

              <div className="card text-center py-12">

                <XCircle className="w-16 h-16 text-slate-600 mx-auto mb-4" />

                <h3 className="text-2xl font-bold text-white mb-2">Nenhuma gravação agendada encontrada</h3>

                <p className="text-muted-foreground">Ajuste os filtros ou crie novos agendamentos.</p>

              </div>

            ) : (

              <>
                <PaginationControls />

                <div className="space-y-4 my-4">

                  {paginatedScheduled.map((gravacao, index) => (

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

                <PaginationControls />
              </>

            )

          ) : activeTab === 'manuais' ? (

            manualGravacoes.length === 0 ? (

              <div className="card text-center py-12">

                <XCircle className="w-16 h-16 text-slate-600 mx-auto mb-4" />

                <h3 className="text-2xl font-bold text-white mb-2">Nenhuma gravacao manual encontrada</h3>

                <p className="text-muted-foreground">Ajuste os filtros ou realize novas gravacoes.</p>

              </div>

            ) : (

              <>
                <PaginationControls />

                <div className="space-y-4 my-4">

                  {paginatedManual.map((gravacao, index) => (

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

                <PaginationControls />
              </>

            )

          ) : concludedGravacoes.length === 0 ? (

            <div className="card text-center py-12">

              <XCircle className="w-16 h-16 text-slate-600 mx-auto mb-4" />

              <h3 className="text-2xl font-bold text-white mb-2">Nenhuma gravação encontrada</h3>

              <p className="text-muted-foreground">Ajuste os filtros ou realize novas gravações.</p>

            </div>

          ) : (

            <>
              <PaginationControls />

              <div className="space-y-4 my-4">

                {paginatedConcluded.map((gravacao, index) => (

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

              <PaginationControls />
            </>

          )}

        </div>

      </div>

    </>

  );

};



export default Gravacoes;
