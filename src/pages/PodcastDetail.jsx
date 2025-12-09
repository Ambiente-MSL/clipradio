import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Loader, Mic2 as MicVocal, Link as LinkIcon, Trash2, Play, ArrowLeft, Zap } from 'lucide-react';

const PodcastDetail = ({ setGlobalAudioTrack }) => {
  const { seriesId } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [series, setSeries] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newEpisodeUrl, setNewEpisodeUrl] = useState('');
  const [processingIds, setProcessingIds] = useState(new Set());

  const fetchSeriesDetails = useCallback(async () => {
    if (!user || !seriesId) return;
    setLoading(true);
    try {
      const { data: seriesData, error: seriesError } = await supabase
        .from('podcast_series')
        .select('*')
        .eq('id', seriesId)
        .single();
      if (seriesError) throw seriesError;
      setSeries(seriesData);

      const { data: episodesData, error: episodesError } = await supabase
        .from('podcasts')
        .select('*')
        .eq('series_id', seriesId)
        .order('created_at', { ascending: false });
      if (episodesError) throw episodesError;
      setEpisodes(episodesData);

    } catch (error) {
      toast({
        title: "Erro ao buscar detalhes da série",
        description: error.message,
        variant: "destructive",
      });
      navigate('/podcasts');
    } finally {
      setLoading(false);
    }
  }, [user, seriesId, toast, navigate]);

  useEffect(() => {
    fetchSeriesDetails();
  }, [fetchSeriesDetails]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel(`podcast-episodes-${seriesId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'podcasts', filter: `series_id=eq.${seriesId}` },
        (payload) => {
          fetchSeriesDetails();
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            setProcessingIds(prev => {
              const newSet = new Set(prev);
              if (payload.new.audio_url) {
                newSet.delete(payload.new.id);
              }
              return newSet;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, seriesId, fetchSeriesDetails]);

  const handleAddEpisode = async () => {
    if (!newEpisodeUrl) {
      toast({ title: "URL necessária", description: "Por favor, insira uma URL.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    
    try {
      const { data: newEpisode, error } = await supabase
        .from('podcasts')
        .insert({
          user_id: user.id,
          series_id: seriesId,
          source_url: newEpisodeUrl,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Episódio Adicionado!",
        description: "A IA já começou a processar o conteúdo.",
      });
      setEpisodes(prev => [newEpisode, ...prev]);
      setProcessingIds(prev => new Set(prev).add(newEpisode.id));
      setNewEpisodeUrl('');
      setIsDialogOpen(false);

      const { error: functionError } = await supabase.functions.invoke('process-podcast', {
        body: JSON.stringify({ podcast_id: newEpisode.id }),
      });

      if (functionError) {
        toast({ title: "Erro ao iniciar IA", description: functionError.message, variant: "destructive" });
        setProcessingIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(newEpisode.id);
            return newSet;
          });
      }

    } catch (error) {
      toast({
        title: "Erro ao adicionar episódio",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEpisode = async (episodeId) => {
    if (!window.confirm("Tem certeza que deseja excluir este episódio?")) return;

    try {
      const { error } = await supabase.from('podcasts').delete().eq('id', episodeId);
      if (error) throw error;
      
      toast({ title: "Episódio excluído com sucesso!" });
      setEpisodes(episodes.filter(p => p.id !== episodeId));
    } catch (error) {
       toast({
        title: "Erro ao excluir episódio",
        description: error.message,
        variant: "destructive",
      });
    }
  };
  
  const handlePlayEpisode = (episode) => {
    if (!episode.audio_url) {
      toast({
        title: "Áudio não disponível",
        description: "O áudio deste episódio ainda não foi processado.",
        variant: "destructive"
      });
      return;
    }
    setGlobalAudioTrack({
      src: episode.audio_url,
      title: episode.title,
      details: series.title,
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader className="w-16 h-16 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{series?.title || 'Série de Podcast'} - IA Recorder</title>
        <meta name="description" content={series?.description || 'Detalhes e episódios da série de podcast.'} />
      </Helmet>
      <div className="p-4 md:p-6 max-w-7xl mx-auto text-white">
        <Button variant="ghost" onClick={() => navigate('/podcasts')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para todas as séries
        </Button>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800/50 rounded-xl p-6 md:p-8 flex flex-col md:flex-row gap-8 items-center mb-8"
        >
          <img 
            alt={`Capa da série ${series.title}`}
            className="w-48 h-48 rounded-lg shadow-lg object-cover flex-shrink-0"
           src="https://images.unsplash.com/photo-1511792962219-5d2d76ebf3ab" />
          <div className="text-center md:text-left">
            <h1 className="text-4xl md:text-5xl font-bold mb-2">{series.title}</h1>
            <p className="text-slate-300 text-lg">{series.description}</p>
          </div>
        </motion.div>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Episódios</h2>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-5 h-5 mr-2" />
                Adicionar Episódio
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-700 text-white">
              <DialogHeader>
                <DialogTitle>Adicionar Novo Episódio</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="episode-url" className="text-right">URL</Label>
                  <div className="col-span-3 relative">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input
                      id="episode-url"
                      value={newEpisodeUrl}
                      onChange={(e) => setNewEpisodeUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAddEpisode} disabled={isSubmitting} className="w-full">
                  {isSubmitting ? <Loader className="animate-spin w-5 h-5 mr-2" /> : <Plus className="w-5 h-5 mr-2" />}
                  {isSubmitting ? 'Adicionando...' : 'Adicionar Episódio'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-4">
          {episodes.length > 0 ? (
            episodes.map((episode, index) => (
              <motion.div
                key={episode.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-slate-800/40 border border-slate-700/60 rounded-lg p-4 flex items-center justify-between hover:bg-slate-800/80 transition-colors"
              >
                <div className="flex items-center gap-4 flex-grow">
                  <Button size="icon" variant="ghost" onClick={() => handlePlayEpisode(episode)} disabled={!episode.audio_url}>
                    {processingIds.has(episode.id) || !episode.audio_url ? <Loader className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                  </Button>
                  <div>
                    <h3 className="font-semibold">{episode.title}</h3>
                    <p className="text-sm text-slate-400 line-clamp-1">{episode.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(processingIds.has(episode.id) || !episode.audio_url) && (
                    <span className="text-xs bg-yellow-500 text-black px-2 py-1 rounded-full flex items-center">
                      <Zap className="w-3 h-3 mr-1" /> Processando
                    </span>
                  )}
                  <span className="text-xs text-slate-500">{new Date(episode.created_at).toLocaleDateString()}</span>
                  <Button variant="destructive" size="icon" onClick={() => handleDeleteEpisode(episode.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="text-center py-16 border-2 border-dashed border-slate-700 rounded-xl">
              <MicVocal className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Nenhum episódio encontrado</h3>
              <p className="text-slate-400">Adicione o primeiro episódio a esta série.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default PodcastDetail;