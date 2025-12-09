import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import InputPalavrasChave from '@/components/InputPalavrasChave';
import { Radio, Calendar, Clock, Wand2, Scissors, Loader, Play, Download, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const EdicaoIA = ({ setGlobalAudioTrack }) => {
  const { id: gravacaoId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [gravacao, setGravacao] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchInitialData = useCallback(async () => {
    if (!user || !gravacaoId) return;
    setLoading(true);
    try {
      const gravacaoPromise = supabase
        .from('gravacoes')
        .select('*, radios(nome)')
        .eq('id', gravacaoId)
        .single();
      
      const clipsPromise = supabase
        .from('clips')
        .select('*')
        .eq('gravacao_id', gravacaoId)
        .order('criado_em', { ascending: false });

      const tagsPromise = supabase
        .from('tags')
        .select('*')
        .eq('user_id', user.id);

      const [{ data: gravacaoData, error: gravacaoError }, { data: clipsData, error: clipsError }, { data: tagsData, error: tagsError }] = await Promise.all([gravacaoPromise, clipsPromise, tagsPromise]);

      if (gravacaoError) throw gravacaoError;
      if (clipsError) throw clipsError;
      if (tagsError) throw tagsError;

      setGravacao(gravacaoData);
      setClips(clipsData || []);
      setAvailableTags(tagsData || []);

    } catch (error) {
      toast({ title: 'Erro ao carregar dados', description: error.message, variant: 'destructive' });
      navigate('/gravacoes');
    } finally {
      setLoading(false);
    }
  }, [gravacaoId, user, toast, navigate]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleProcessar = async () => {
    if (selectedTags.length === 0) {
      toast({ title: 'Nenhuma palavra-chave', description: 'Adicione pelo menos uma palavra-chave para processar.', variant: 'destructive' });
      return;
    }
    setProcessing(true);
    toast({ title: '🤖 Processando com IA...', description: 'Aguarde enquanto os clipes são gerados.' });

    try {
      const { error } = await supabase.functions.invoke('process-audio-with-ai', {
        body: {
          gravacao_id: gravacaoId,
          palavras_chave: selectedTags,
          user_id: user.id,
        },
      });
      if (error) throw error;
      toast({ title: '✅ Sucesso!', description: 'Clipes gerados com sucesso.' });
      
      const { data: clipsData, error: clipsError } = await supabase
        .from('clips')
        .select('*')
        .eq('gravacao_id', gravacaoId)
        .order('criado_em', { ascending: false });
      
      if (clipsError) throw clipsError;
      setClips(clipsData || []);

    } catch (error) {
      toast({ title: 'Erro no processamento', description: error.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handlePlayClip = (clip) => {
    if (!gravacao?.arquivo_url) {
      toast({ title: 'Áudio original não encontrado', variant: 'destructive' });
      return;
    }
    setGlobalAudioTrack({
      src: gravacao.arquivo_url,
      title: `Clipe: "${clip.palavra_chave}"`,
      details: `Rádio: ${gravacao.radios?.nome || 'Desconhecida'}`,
      startTime: clip.inicio_segundos,
      endTime: clip.fim_segundos,
    });
  };

  const handleDownloadClip = (url) => {
    if (!url) {
      toast({ title: 'URL inválida', description: 'Não é possível baixar este clipe.', variant: 'destructive' });
      return;
    }
    window.open(url, '_blank');
  };
  
  const handleDeleteClip = async (clipId) => {
     if (!window.confirm("Tem certeza de que deseja excluir este clipe? Esta ação não pode ser desfeita.")) return;
    try {
        const {error} = await supabase.from('clips').delete().eq('id', clipId);
        if(error) throw error;
        toast({ title: "Clipe excluído com sucesso!"});
        setClips(clips.filter(c => c.id !== clipId));
    } catch (error) {
        toast({ title: "Erro ao excluir o clipe", description: error.message, variant: 'destructive'});
    }
  };

  const handleDeleteGravacao = async () => {
    if (!window.confirm("ATENÇÃO: Você está prestes a excluir a gravação principal e todos os seus clipes. Esta ação é irreversível. Deseja continuar?")) return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('delete-recording', {
        body: JSON.stringify({ gravacao_id: gravacaoId }),
      });
      if (error) throw error;
      toast({ title: 'Gravação excluída com sucesso!', description: 'Você será redirecionado para a lista de gravações.' });
      setTimeout(() => navigate('/gravacoes'), 2000);
    } catch (error) {
      toast({ title: 'Erro ao excluir gravação', description: error.message, variant: 'destructive' });
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader className="w-12 h-12 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Edição com IA - {gravacao?.radios?.nome || 'Gravação'}</title>
        <meta name="description" content="Use o poder da IA para cortar e editar suas gravações de rádio." />
      </Helmet>
      <div className="p-6 max-w-6xl mx-auto space-y-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold gradient-text mb-2 flex items-center gap-3">
            <Wand2 /> Editar com IA
          </h1>
          <p className="text-slate-400 text-lg">Corte seus áudios de forma inteligente com palavras-chave</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-2">
            <Card className="bg-card/80 backdrop-blur-sm border-slate-700/50 h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-white"><Scissors />Área de Edição</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-300">1. Adicione Palavras-Chave</h3>
                  <p className="text-sm text-slate-400">Insira as tags que a IA usará para encontrar e cortar os trechos relevantes do áudio. Pressione 'Enter' para criar uma nova tag.</p>
                  <InputPalavrasChave
                    selectedTags={selectedTags}
                    onSelectedTagsChange={setSelectedTags}
                    availableTags={availableTags}
                    onAvailableTagsChange={setAvailableTags}
                  />
                  <Button onClick={handleProcessar} disabled={processing || selectedTags.length === 0} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-lg py-6">
                    {processing ? <Loader className="w-5 h-5 animate-spin mr-2" /> : <Wand2 className="w-5 h-5 mr-2" />}
                    {processing ? 'Processando...' : 'Processar com IA e Gerar Clipes'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
            <Card className="bg-card/80 backdrop-blur-sm border-slate-700/50 h-full flex flex-col">
              <CardHeader>
                <CardTitle className="text-white">Detalhes da Gravação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-slate-300 flex-grow">
                <div className="flex items-center gap-3">
                  <Radio className="w-5 h-5 text-cyan-400" />
                  <span>{gravacao?.radios?.nome || 'Rádio Desconhecida'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-cyan-400" />
                  <span>{gravacao ? format(new Date(gravacao.criado_em), 'dd/MM/yyyy, HH:mm', { locale: ptBR }) : 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-cyan-400" />
                  <span>Duração: {Math.round((gravacao?.duracao_segundos || 0) / 60)} min</span>
                </div>
              </CardContent>
              <div className="p-6 pt-0">
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={handleDeleteGravacao}
                  disabled={deleting}
                >
                  {deleting ? <Loader className="w-5 h-5 animate-spin mr-2" /> : <Trash2 className="w-5 h-5 mr-2" />}
                  {deleting ? 'Excluindo...' : 'Excluir Gravação e Clipes'}
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="bg-card/80 backdrop-blur-sm border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white">2. Clipes Gerados</CardTitle>
              <CardDescription>
                {clips.length > 0 ? `Foram encontrados ${clips.length} clipes.` : 'Nenhum clipe gerado ainda. Processe com a IA para começar.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {clips.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {clips.map((clip) => (
                    <motion.div 
                      key={clip.id} 
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-slate-800/60 p-4 rounded-lg border border-slate-700 hover:border-cyan-400 transition-colors"
                    >
                      <h4 className="font-bold text-white truncate">Clipe sobre "{clip.palavra_chave}"</h4>
                      <div className="text-sm text-slate-400 flex justify-between mt-1">
                        <span>Duração: {clip.duracao_segundos}s</span>
                        <span>Início: {new Date(clip.inicio_segundos * 1000).toISOString().substr(14, 5)}</span>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => handlePlayClip(clip)}>
                          <Play className="w-4 h-4 mr-2"/> Ouvir
                        </Button>
                        <Button variant="secondary" size="icon" onClick={() => handleDownloadClip(clip.arquivo_url)}>
                          <Download className="w-4 h-4"/>
                        </Button>
                        <Button variant="destructive" size="icon" onClick={() => handleDeleteClip(clip.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-slate-500">
                  <p>Os clipes gerados aparecerão aqui.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default EdicaoIA;