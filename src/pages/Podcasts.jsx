import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Loader, Mic2 as MicVocal, Trash2, Play, ListMusic } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Podcasts = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newSeriesTitle, setNewSeriesTitle] = useState('');
  const [newSeriesDescription, setNewSeriesDescription] = useState('');

  const fetchSeries = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('podcast_series')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSeries(data);
    } catch (error) {
      toast({
        title: "Erro ao buscar séries de podcast",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchSeries();
  }, [fetchSeries]);

  const handleAddSeries = async () => {
    if (!newSeriesTitle) {
      toast({ title: "Título necessário", description: "Por favor, insira um título para a série.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    
    try {
      const { data: newSeriesData, error } = await supabase
        .from('podcast_series')
        .insert({
          user_id: user.id,
          title: newSeriesTitle,
          description: newSeriesDescription,
          cover_url: `https://source.unsplash.com/random/400x400/?podcast,abstract&sig=${Math.random()}`
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Série Adicionada!",
        description: "Agora você pode adicionar episódios a ela.",
      });
      setSeries(prev => [newSeriesData, ...prev]);
      setNewSeriesTitle('');
      setNewSeriesDescription('');
      setIsDialogOpen(false);
    } catch (error) {
      toast({
        title: "Erro ao adicionar série",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSeries = async (seriesId) => {
    if (!window.confirm("Tem certeza que deseja excluir esta série e todos os seus episódios? Esta ação não pode ser desfeita.")) return;

    try {
      const { error } = await supabase.from('podcast_series').delete().eq('id', seriesId);
      if (error) throw error;
      
      toast({ title: "Série excluída com sucesso!" });
      setSeries(series.filter(s => s.id !== seriesId));
    } catch (error) {
       toast({
        title: "Erro ao excluir série",
        description: error.message,
        variant: "destructive",
      });
    }
  };
  
  const handleViewSeries = (seriesId) => {
    navigate(`/podcasts/${seriesId}`);
  };

  return (
    <>
      <Helmet>
        <title>Séries de Podcast - IA Recorder</title>
        <meta name="description" content="Gerencie suas séries de podcasts gerados por IA." />
      </Helmet>
      <div className="p-4 md:p-6 space-y-8 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-between items-center"
        >
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white flex items-center">
              <MicVocal className="w-8 h-8 mr-3" />
              Séries de Podcast
            </h1>
            <p className="text-md text-slate-400">Crie e gerencie suas séries de podcasts.</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-5 h-5 mr-2" />
                Nova Série
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-700 text-white">
              <DialogHeader>
                <DialogTitle>Criar Nova Série de Podcast</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="series-title" className="text-right">
                    Título
                  </Label>
                  <Input
                    id="series-title"
                    value={newSeriesTitle}
                    onChange={(e) => setNewSeriesTitle(e.target.value)}
                    placeholder="Ex: Marketing Político Semanal"
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="series-desc" className="text-right">
                    Descrição
                  </Label>
                  <Input
                    id="series-desc"
                    value={newSeriesDescription}
                    onChange={(e) => setNewSeriesDescription(e.target.value)}
                    placeholder="Uma breve descrição da série"
                    className="col-span-3"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAddSeries} disabled={isSubmitting} className="w-full">
                  {isSubmitting ? <Loader className="animate-spin w-5 h-5 mr-2" /> : <Plus className="w-5 h-5 mr-2" />}
                  {isSubmitting ? 'Criando...' : 'Criar Série'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </motion.div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader className="w-12 h-12 animate-spin text-cyan-400" />
          </div>
        ) : series.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-24 border-2 border-dashed border-slate-700 rounded-xl"
          >
            <MicVocal className="w-20 h-20 text-slate-600 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-white mb-2">Nenhuma série de podcast encontrada</h3>
            <p className="text-slate-400 mb-6">Crie sua primeira série para começar a adicionar episódios.</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="w-5 h-5 mr-2" /> Criar Nova Série
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {series.map((s, index) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="bg-slate-800/40 border-slate-700/60 h-full flex flex-col group cursor-pointer" onClick={() => handleViewSeries(s.id)}>
                  <CardHeader className="p-0">
                    <div className="relative aspect-square">
                      <img 
                        alt={`Capa da série ${s.title}`}
                        className="w-full h-full object-cover rounded-t-xl"
                       src="https://images.unsplash.com/photo-1511792962219-5d2d76ebf3ab" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-4">
                        <Button variant="outline" size="icon" onClick={(e) => {e.stopPropagation(); handleViewSeries(s.id)}}>
                          <ListMusic className="w-5 h-5" />
                        </Button>
                         <Button variant="destructive" size="icon" onClick={(e) => {e.stopPropagation(); handleDeleteSeries(s.id)}}>
                            <Trash2 className="w-5 h-5" />
                          </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 flex-grow flex flex-col">
                    <CardTitle className="text-lg font-bold text-white truncate mb-1">{s.title}</CardTitle>
                    <p className="text-sm text-slate-400 line-clamp-2 flex-grow">{s.description || 'Sem descrição.'}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default Podcasts;