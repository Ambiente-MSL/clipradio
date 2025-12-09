import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Loader, BrainCircuit, Trash2, Zap, Play, Pause, ChevronsRight } from 'lucide-react';
import { TagInput } from '@/components/TagInput';
import TopicSuggester from '@/components/TopicSuggester';

const INITIAL_FORM_STATE = {
  name: '',
  description: '',
  topics: [],
  targetSeriesId: '',
};

const AgentesIA = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [agents, setAgents] = useState([]);
  const [podcastSeries, setPodcastSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [runningAgentId, setRunningAgentId] = useState(null);

  const fetchInitialData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [agentsRes, seriesRes] = await Promise.all([
        supabase.from('ia_agents').select('*, podcast_series(title)').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('podcast_series').select('id, title').eq('user_id', user.id)
      ]);

      if (agentsRes.error) throw agentsRes.error;
      if (seriesRes.error) throw seriesRes.error;

      setAgents(agentsRes.data);
      setPodcastSeries(seriesRes.data);
    } catch (error) {
      toast({ title: "Erro ao carregar dados", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSuggestTopics = (suggestedTopics) => {
      handleInputChange('topics', [...formData.topics, ...suggestedTopics]);
      toast({ title: "Tópicos sugeridos!", description: "Novas ideias foram adicionadas à sua lista." });
  }

  const resetForm = () => {
    setFormData(INITIAL_FORM_STATE);
  };

  const handleAddAgent = async () => {
    if (!formData.name || formData.topics.length === 0 || !formData.targetSeriesId) {
      toast({ title: "Campos obrigatórios", description: "Nome, Tópicos e Série Alvo são necessários.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: newAgent, error } = await supabase
        .from('ia_agents')
        .insert({
          user_id: user.id,
          name: formData.name,
          description: formData.description,
          topics: formData.topics.map(t => t.name),
          target_series_id: formData.targetSeriesId,
          status: 'active'
        })
        .select('*, podcast_series(title)')
        .single();
      
      if (error) throw error;

      toast({ title: "Agente de IA Criado!", description: `${formData.name} começará a gerar conteúdo em breve.` });
      setAgents(prev => [newAgent, ...prev]);
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      toast({ title: "Erro ao criar agente", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAgent = async (agentId) => {
    if (!window.confirm("Tem certeza que deseja excluir este agente?")) return;
    try {
      const { error } = await supabase.from('ia_agents').delete().eq('id', agentId);
      if (error) throw error;
      toast({ title: "Agente excluído com sucesso!" });
      setAgents(agents.filter(a => a.id !== agentId));
    } catch (error) {
      toast({ title: "Erro ao excluir agente", description: error.message, variant: "destructive" });
    }
  };

  const handleToggleStatus = async (agent) => {
    const newStatus = agent.status === 'active' ? 'paused' : 'active';
    try {
      const { data, error } = await supabase
        .from('ia_agents')
        .update({ status: newStatus })
        .eq('id', agent.id)
        .select('*, podcast_series(title)')
        .single();
      
      if (error) throw error;

      toast({ title: `Agente ${newStatus === 'active' ? 'ativado' : 'pausado'}`, description: `O agente ${agent.name} foi ${newStatus === 'active' ? 'reativado' : 'pausado'}.` });
      setAgents(prev => prev.map(a => (a.id === agent.id ? data : a)));
    } catch (error) {
       toast({ title: "Erro ao alterar status", description: error.message, variant: "destructive" });
    }
  };

  const handleRunAgentNow = async (agentId) => {
    setRunningAgentId(agentId);
    try {
      const { data, error } = await supabase.functions.invoke('content-creation-agent', {
        body: JSON.stringify({ agent_id: agentId })
      });

      if (error) throw error;

      toast({ title: "Agente em execução!", description: data.message });
    } catch (error) {
      toast({ title: "Erro ao executar agente", description: error.message, variant: "destructive" });
    } finally {
      setTimeout(() => setRunningAgentId(null), 2000);
    }
  }

  return (
    <>
      <Helmet>
        <title>Agentes de IA - IA Recorder</title>
        <meta name="description" content="Crie e gerencie agentes de IA para gerar conteúdo de podcast automaticamente." />
      </Helmet>
      <div className="p-4 md:p-6 space-y-8 max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white flex items-center"><BrainCircuit className="w-8 h-8 mr-3 text-cyan-400" />Agentes de IA</h1>
            <p className="text-md text-slate-400">Sua equipe de criação de conteúdo automatizada.</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="w-5 h-5 mr-2" />Novo Agente</Button></DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-slate-900 border-slate-700 text-white">
              <DialogHeader><DialogTitle>Criar Novo Agente de IA</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="agent-name">Nome do Agente</Label>
                  <Input id="agent-name" value={formData.name} onChange={(e) => handleInputChange('name', e.target.value)} placeholder="Ex: Pesquisador de Marketing Político" />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="agent-desc">Descrição (Opcional)</Label>
                  <Input id="agent-desc" value={formData.description} onChange={(e) => handleInputChange('description', e.target.value)} placeholder="Qual a missão deste agente?" />
                </div>
                <div>
                  <Label className="mb-2 block">Tópicos de Pesquisa</Label>
                  <TagInput tags={formData.topics} setTags={(newTags) => handleInputChange('topics', newTags)} placeholder="Adicione tópicos como 'Marketing Político'" />
                  <TopicSuggester onSuggest={handleSuggestTopics} mainTopic={formData.name} />
                </div>
                <div>
                  <Label className="mb-2 block">Publicar na Série de Podcast</Label>
                   <Select onValueChange={(value) => handleInputChange('targetSeriesId', value)} value={formData.targetSeriesId}>
                    <SelectTrigger><SelectValue placeholder="Selecione uma série..." /></SelectTrigger>
                    <SelectContent>
                      {podcastSeries.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAddAgent} disabled={isSubmitting} className="w-full">
                  {isSubmitting ? <Loader className="animate-spin w-5 h-5 mr-2" /> : <Zap className="w-5 h-5 mr-2" />}{isSubmitting ? 'Criando...' : 'Ativar Agente'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </motion.div>

        {loading ? (
          <div className="flex justify-center items-center h-64"><Loader className="w-12 h-12 animate-spin text-cyan-400" /></div>
        ) : agents.length === 0 ? (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-24 border-2 border-dashed border-slate-700 rounded-xl">
            <BrainCircuit className="w-20 h-20 text-slate-600 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-white mb-2">Nenhum agente de IA encontrado</h3>
            <p className="text-slate-400 mb-6">Crie seu primeiro agente para automatizar a criação de conteúdo.</p>
            <Button onClick={() => setIsDialogOpen(true)}><Plus className="w-5 h-5 mr-2" /> Criar Novo Agente</Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent, index) => (
              <motion.div key={agent.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                <Card className={`bg-slate-800/40 border-slate-700/60 h-full flex flex-col group transition-all duration-300 ${agent.status === 'paused' ? 'opacity-60' : ''} ${runningAgentId === agent.id ? 'ring-2 ring-cyan-400 shadow-lg shadow-cyan-500/20' : ''}`}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg font-bold text-white mb-1 flex items-center">
                          <span className={`w-3 h-3 rounded-full mr-3 transition-colors ${agent.status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`}></span>
                          {agent.name}
                        </CardTitle>
                        <CardDescription>{agent.description || 'Sem descrição.'}</CardDescription>
                      </div>
                       <Button variant="ghost" size="icon" onClick={() => handleDeleteAgent(agent.id)} className="text-slate-400 hover:text-red-500 hover:bg-red-500/10">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-grow">
                     <div className="mb-4">
                        <p className="text-sm font-semibold text-slate-400 mb-2">Tópicos:</p>
                        <div className="flex flex-wrap gap-2">
                            {agent.topics.map(topic => <span key={topic} className="bg-cyan-500/20 text-cyan-300 text-xs font-medium px-2 py-1 rounded-full">{topic}</span>)}
                        </div>
                    </div>
                     <div>
                        <p className="text-sm font-semibold text-slate-400 mb-1">Série Alvo:</p>
                        <p className="text-white font-medium">{agent.podcast_series?.title || 'Série não encontrada'}</p>
                    </div>
                  </CardContent>
                  <CardFooter className="flex-col items-stretch space-y-2">
                    <Button onClick={() => handleToggleStatus(agent)} variant="secondary">
                        {agent.status === 'active' ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                        {agent.status === 'active' ? 'Pausar Agente' : 'Reativar Agente'}
                    </Button>
                    <Button onClick={() => handleRunAgentNow(agent.id)} disabled={runningAgentId !== null}>
                        {runningAgentId === agent.id ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <ChevronsRight className="w-4 h-4 mr-2" />}
                        {runningAgentId === agent.id ? 'Executando...' : 'Executar Agora'}
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default AgentesIA;