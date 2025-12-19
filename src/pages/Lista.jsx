import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import RadioListItem from '@/components/RadioListItem';
import { Loader, List, SearchX } from 'lucide-react';
import { Input } from '@/components/ui/input';

const Lista = () => {
  const [radios, setRadios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchRadios = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('radios')
      .select('*')
      .eq('user_id', user.id)
      .order('nome', { ascending: true });

    if (error) {
      toast({ title: "Erro ao buscar rádios", description: error.message, variant: "destructive" });
    } else {
      setRadios(data);
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    fetchRadios();
  }, [fetchRadios]);

  const handleToggleFavorite = async (radioToUpdate) => {
    const updatedStatus = !radioToUpdate.favorita;
    const { data, error } = await supabase
      .from('radios')
      .update({ favorita: updatedStatus })
      .eq('id', radioToUpdate.id)
      .select()
      .single();

    if (error) {
      toast({ title: 'Erro ao favoritar', description: error.message, variant: 'destructive' });
    } else {
      setRadios((prev) => prev.map((r) => (r.id === data.id ? data : r)));
      toast({
        title: `Rádio ${updatedStatus ? 'adicionada aos' : 'removida dos'} favoritos!`,
        description: `${data.nome}`,
      });
    }
  };

  const filteredRadios = radios.filter((radio) =>
    radio.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <Helmet>
        <title>Rádios | Clipradio</title>
        <meta name="description" content="Veja todas as suas rádios cadastradas em um formato de lista." />
      </Helmet>
      <div className="container mx-auto p-4 md:p-6">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold gradient-text mb-2 flex items-center gap-3">
            <List /> Lista de Rádios
          </h1>
          <p className="text-slate-400 text-lg">Todas as suas estações em uma visualização simples e direta.</p>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mb-6 max-w-lg">
            <Input
              type="text"
              placeholder="Buscar rádio por nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-card/80 backdrop-blur-sm border-slate-700/50"
            />
        </motion.div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader className="w-12 h-12 animate-spin text-cyan-400" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-card/80 backdrop-blur-sm border border-slate-700/50 rounded-lg shadow-lg"
          >
            {filteredRadios.length > 0 ? (
              <div className="divide-y divide-slate-800/50">
                {filteredRadios.map((radio, index) => (
                  <RadioListItem
                    key={radio.id}
                    radio={radio}
                    index={index}
                    onToggleFavorite={handleToggleFavorite}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-20 px-6">
                <SearchX className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Nenhuma rádio encontrada</h2>
                <p className="text-slate-400">
                  {radios.length === 0 ? "Você ainda não cadastrou nenhuma rádio." : "Tente um termo de busca diferente."}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </>
  );
};

export default Lista;