import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import apiClient from '@/lib/apiClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { Radio, Calendar, Download, Loader, LayoutGrid, Plus, Globe, MapPin, Star, StarOff, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Helmet } from 'react-helmet';

const Dashboard = () => {
  const [stats, setStats] = useState({ radios: 0, agendamentos: 0, gravacoes: 0 });
  const [loadingStats, setLoadingStats] = useState(true);
  const [formData, setFormData] = useState({
    nome: '',
    stream_url: '',
    cidade: '',
    estado: '',
    favorita: false,
    bitrate_kbps: 128,
    output_format: 'mp3',
    audio_mode: 'stereo',
  });
  const [saving, setSaving] = useState(false);
  const [streamStatus, setStreamStatus] = useState({ state: 'idle', message: '' });
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchStats = useCallback(async () => {
    if (!user) return;
    setLoadingStats(true);
    try {
      const [radiosData, agendamentosData, gravacoesData] = await Promise.all([
        apiClient.getRadios(),
        apiClient.getAgendamentos(),
        apiClient.getGravacoes(),
      ]);

      setStats({
        radios: radiosData?.length || 0,
        agendamentos: (agendamentosData || []).filter((a) => a.status === 'agendado').length,
        gravacoes: gravacoesData?.length || 0,
      });
    } catch (error) {
      toast({ title: 'Erro ao buscar estatísticas', description: error.message, variant: 'destructive' });
    }
    setLoadingStats(false);
  }, [user, toast]);

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user, fetchStats]);

  // Validação do stream URL
  useEffect(() => {
    const url = formData.stream_url.trim();
    if (!url) {
      setStreamStatus({ state: 'idle', message: '' });
      return;
    }

    let cancelled = false;
    const audio = new Audio();
    let timeoutId;

    function cleanup() {
      audio.pause();
      audio.src = '';
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('loadedmetadata', handleCanPlay);
      audio.removeEventListener('error', handleError);
      if (timeoutId) clearTimeout(timeoutId);
    }

    function handleCanPlay() {
      if (cancelled) return;
      setStreamStatus({ state: 'valid', message: 'Stream válido para agendamentos e gravações.' });
      cleanup();
    }

    function handleError() {
      if (cancelled) return;
      setStreamStatus({ state: 'error', message: 'Não foi possível validar este stream.' });
      cleanup();
    }

    setStreamStatus({ state: 'loading', message: 'Validando stream...' });

    timeoutId = setTimeout(() => {
      if (cancelled) return;
      setStreamStatus({ state: 'error', message: 'Tempo esgotado ao validar o stream.' });
      cleanup();
    }, 8000);

    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('loadedmetadata', handleCanPlay);
    audio.addEventListener('error', handleError);
    audio.src = url;
    audio.load();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [formData.stream_url]);

  const resetForm = useCallback(() => {
    setFormData({ nome: '', stream_url: '', cidade: '', estado: '', favorita: false, bitrate_kbps: 128, output_format: 'mp3', audio_mode: 'stereo' });
    setStreamStatus({ state: 'idle', message: '' });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.nome || !formData.stream_url || !formData.cidade || !formData.estado) {
      toast({ title: 'Erro', description: 'Todos os campos são obrigatórios', variant: 'destructive' });
      return;
    }

    if (streamStatus.state === 'error') {
      toast({ title: 'URL inválida', description: 'Ajuste a URL do stream antes de salvar.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await apiClient.createRadio(formData);
      toast({ title: 'Sucesso!', description: 'Rádio cadastrada com sucesso' });
      resetForm();
      fetchStats();
    } catch (error) {
      toast({ title: 'Erro ao salvar rádio', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const renderStreamStatusIcon = () => {
    if (streamStatus.state === 'loading') {
      return <Loader className="w-4 h-4 text-cyan-400 animate-spin" />;
    }
    if (streamStatus.state === 'valid') {
      return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    }
    if (streamStatus.state === 'error') {
      return <AlertCircle className="w-4 h-4 text-red-400" />;
    }
    return null;
  };

  const StatCard = ({ icon, title, value, loading, gradient, iconColor, onNavigate }) => (
    <motion.div whileHover={{ scale: 1.05 }} transition={{ type: 'spring', stiffness: 300 }}>
      <div
        className={`relative overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br ${gradient} p-5 shadow-xl cursor-pointer`}
        onClick={onNavigate}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-slate-300 text-sm">{title}</p>
            {loading ? (
              <Loader className="w-8 h-8 animate-spin mt-1 text-cyan-400" />
            ) : (
              <p className="text-4xl font-bold text-white mt-1">{value}</p>
            )}
          </div>
          <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-lg">
            <div className={iconColor}>{icon}</div>
          </div>
        </div>
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-white/5 via-transparent to-transparent" />
      </div>
    </motion.div>
  );

  return (
    <>
      <Helmet>
        <title>Dashboard | Clipradio</title>
        <meta name="description" content="Visão geral do seu sistema de gravação de rádios." />
      </Helmet>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl md:text-4xl font-bold gradient-text">Dashboard</h1>
          <p className="text-muted-foreground mt-2 text-lg">Visão geral do sistema de gravação.</p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, staggerChildren: 0.1 }}
        >
          <StatCard
            icon={<Radio className="w-8 h-8" />}
            title="Rádios cadastradas"
            value={stats.radios}
            loading={loadingStats}
            gradient="from-cyan-600/50 via-cyan-500/30 to-slate-900"
            iconColor="text-cyan-300"
            onNavigate={() => navigate('/cadastro-radios')}
          />
          <StatCard
            icon={<Calendar className="w-8 h-8" />}
            title="Agendamentos ativos"
            value={stats.agendamentos}
            loading={loadingStats}
            gradient="from-emerald-600/50 via-emerald-500/30 to-slate-900"
            iconColor="text-emerald-300"
            onNavigate={() => navigate('/agendamentos')}
          />
          <StatCard
            icon={<Download className="w-8 h-8" />}
            title="Gravações"
            value={stats.gravacoes}
            loading={loadingStats}
            gradient="from-amber-600/40 via-amber-500/20 to-slate-900"
            iconColor="text-amber-300"
            onNavigate={() => navigate('/gravacoes')}
          />
        </motion.div>

        <motion.div
          className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          {/* Card Nova Rádio - Esquerda */}
          <div className="lg:col-span-1">
            <Card className="bg-slate-800/40 border-slate-700/60">
              <CardHeader>
                <CardTitle className="flex items-center text-white">
                  <Plus className="w-6 h-6 mr-3 text-cyan-400" />
                  Nova rádio
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Nome da rádio</label>
                    <Input
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      placeholder="Ex: Rádio Rock"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">URL do Stream</label>
                    <div className="relative">
                      <Input
                        className="pr-10"
                        value={formData.stream_url}
                        onChange={(e) => setFormData({ ...formData, stream_url: e.target.value })}
                        placeholder="https://stream.minharadio.com/stream"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {renderStreamStatusIcon()}
                      </div>
                    </div>
                    {streamStatus.state === 'error' && (
                      <p className="text-xs text-red-400 mt-1">{streamStatus.message}</p>
                    )}
                    {streamStatus.state === 'valid' && (
                      <p className="text-xs text-emerald-400 mt-1">
                        Stream reconhecido e pronto para agendamentos ou gravações.
                      </p>
                    )}
                    {streamStatus.state === 'loading' && (
                      <p className="text-xs text-slate-400 mt-1">Validando stream...</p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Cidade</label>
                      <div className="relative">
                        <Input
                          value={formData.cidade}
                          onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                          placeholder="São Paulo"
                        />
                        <Globe className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Estado (UF)</label>
                      <div className="relative">
                        <Input
                          maxLength={2}
                          value={formData.estado}
                          onChange={(e) => setFormData({ ...formData, estado: e.target.value.toUpperCase() })}
                          placeholder="SP"
                        />
                        <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex flex-col">
                      <label className="block text-sm text-slate-400 mb-1 h-5">Bitrate da gravação</label>
                      <select
                        value={formData.bitrate_kbps}
                        onChange={(e) => setFormData({ ...formData, bitrate_kbps: Number(e.target.value) })}
                        className="w-full h-[42px] bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      >
                        <option value={128}>128 kbps</option>
                        <option value={96}>96 kbps</option>
                      </select>
                    </div>
                    <div className="flex flex-col">
                      <label className="block text-sm text-slate-400 mb-1 h-5">Formato do arquivo</label>
                      <select
                        value={formData.output_format}
                        onChange={(e) => setFormData({ ...formData, output_format: e.target.value })}
                        className="w-full h-[42px] bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      >
                        <option value="mp3">MP3</option>
                        <option value="opus">Opus</option>
                      </select>
                    </div>
                    <div className="flex flex-col">
                      <label className="block text-sm text-slate-400 mb-1 h-5">Qualidade</label>
                      <select
                        value={formData.audio_mode}
                        onChange={(e) => setFormData({ ...formData, audio_mode: e.target.value })}
                        className="w-full h-[42px] bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      >
                        <option value="stereo">Estéreo</option>
                        <option value="mono">Mono</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-slate-300">Marcar como favorita</span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setFormData((prev) => ({ ...prev, favorita: !prev.favorita }))}
                      className="text-yellow-400"
                    >
                      {formData.favorita ? <Star className="w-5 h-5" /> : <StarOff className="w-5 h-5" />}
                    </Button>
                  </div>

                  <Button type="submit" className="w-full" disabled={saving}>
                    {saving ? 'Salvando...' : 'Adicionar Rádio'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Card Painel de Rádios - Direita */}
          <div className="lg:col-span-2">
            <Card className="bg-slate-800/40 border-slate-700/60 h-full">
              <CardContent className="flex flex-col items-center justify-center h-full p-8 text-center">
                <LayoutGrid className="w-16 h-16 text-cyan-400 mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Acesse o painel de rádios</h2>
                <p className="text-slate-400 mb-6 max-w-md">
                  Controle suas rádios, ouça ao vivo, grave manualmente e veja seus agendamentos.
                </p>
                <Button
                  className="bg-cyan-500 hover:bg-cyan-600 text-white"
                  onClick={() => navigate('/cadastro-radios')}
                >
                  <LayoutGrid className="w-5 h-5 mr-2" />
                  Ir para rádios
                </Button>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default Dashboard;

