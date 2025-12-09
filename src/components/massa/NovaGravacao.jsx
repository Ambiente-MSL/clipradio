import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Layers, Loader, Clock, Repeat, MapPin, Globe } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


const NovaGravacao = ({ onBatchStart }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [allRadios, setAllRadios] = useState([]);
  
  const [config, setConfig] = useState({
    estado: '',
    cidade: '',
    limiteEstacoes: true,
    numeroEstacoes: 10,
    hora_inicio: '09:00',
    hora_fim: '10:00',
    tipo_recorrencia: 'none',
    data_inicio: new Date().toISOString().split('T')[0],
    dias_da_semana: [],
  });
  
  const DIAS_SEMANA_OPTIONS = [
    { id: 1, label: 'Seg' },
    { id: 2, label: 'Ter' },
    { id: 3, label: 'Qua' },
    { id: 4, label: 'Qui' },
    { id: 5, label: 'Sex' },
    { id: 6, label: 'Sáb' },
    { id: 0, label: 'Dom' },
  ];

  const fetchRadios = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from('radios').select('id, cidade, estado').eq('user_id', user.id);
      if (error) throw error;
      setAllRadios(data);
    } catch (error) {
      toast({ title: 'Erro ao buscar rádios', description: error.message, variant: 'destructive' });
    }
  }, [user, toast]);

  useEffect(() => { fetchRadios(); }, [fetchRadios]);
  
  const estadosUnicos = useMemo(() => {
    return [...new Set(allRadios.map(r => r.estado).filter(Boolean))].sort();
  }, [allRadios]);
  
  const cidadesDoEstado = useMemo(() => {
    if (!config.estado) return [];
    return [...new Set(allRadios.filter(r => r.estado === config.estado).map(r => r.cidade).filter(Boolean))].sort();
  }, [allRadios, config.estado]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setConfig(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };
  
  const handleSelectChange = (name, value) => {
      const newState = { ...config, [name]: value };
      if (name === 'estado') {
          newState.cidade = ''; // Reset city when state changes
      }
      setConfig(newState);
  };
  
  const handleDiasSemanaChange = (dia) => {
    const { dias_da_semana } = config;
    const newDias = dias_da_semana.includes(dia)
      ? dias_da_semana.filter(d => d !== dia)
      : [...dias_da_semana, dia];
    setConfig(prev => ({ ...prev, dias_da_semana: newDias }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!config.estado && !config.cidade) {
      toast({ title: "Seleção necessária", description: "Por favor, selecione pelo menos um estado.", variant: "destructive" });
      return;
    }
    setLoading(true);

    try {
      let query = supabase
        .from('radios')
        .select('id, nome, user_id')
        .eq('user_id', user.id);
        
      if(config.estado) {
        query = query.eq('estado', config.estado);
      }
      if(config.cidade) {
        query = query.eq('cidade', config.cidade);
      }

      if (config.limiteEstacoes) {
        query = query.limit(config.numeroEstacoes);
      }

      const { data: radios, error } = await query;
      if (error) throw error;
      
      if (!radios || radios.length === 0) {
        toast({ title: "Nenhuma rádio encontrada", description: "Não foram encontradas rádios para os filtros selecionados." });
        setLoading(false);
        return;
      }
      
      const batchId = crypto.randomUUID();
      const agendamentos = radios.map(radio => ({
        user_id: user.id,
        radio_id: radio.id,
        status: 'agendado',
        hora_inicio: config.hora_inicio,
        hora_fim: config.hora_fim,
        tipo_recorrencia: config.tipo_recorrencia,
        data_inicio: config.data_inicio,
        dias_da_semana: config.tipo_recorrencia === 'weekly' ? config.dias_da_semana : null
      }));

      const { data: createdAgendamentos, error: insertError } = await supabase.from('agendamentos').insert(agendamentos).select();
      if (insertError) throw insertError;

      const gravacoesIniciais = createdAgendamentos.map(agendamento => {
          const radio = radios.find(r => r.id === agendamento.radio_id);
          return {
              user_id: user.id,
              radio_id: agendamento.radio_id,
              agendamento_id: agendamento.id,
              batch_id: batchId,
              status: 'iniciando',
              tipo: 'massa',
              arquivo_nome: `${radio.nome.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().replace(/[:.]/g, "-")}.aac`,
              criado_em: new Date().toISOString(),
          };
      });

      const { data: createdGravacoes, error: gravacaoError } = await supabase.from('gravacoes').insert(gravacoesIniciais).select('*, radios(nome)');
      if(gravacaoError) throw gravacaoError;
      
      toast({
        title: "Gravações em Massa Iniciadas!",
        description: `${createdGravacoes.length} gravações foram criadas e estão iniciando.`,
      });
      
      onBatchStart(batchId, createdGravacoes);

      for (const gravacao of createdGravacoes) {
        try {
          const { error: functionError } = await supabase.functions.invoke('record-stream', {
            body: JSON.stringify({
              recording_id: gravacao.id,
              agendamento_id: gravacao.agendamento_id,
            }),
          });
          if (functionError) throw functionError;
        } catch (error) {
            let errorMessage = error.message;
            try {
                const parsedError = JSON.parse(error.message.substring(error.message.indexOf('{')));
                if (parsedError.error) errorMessage = parsedError.error;
            } catch (e) { /* Ignore */ }
            
            if (process.env.NODE_ENV === 'development') {
              console.error(`Erro ao invocar gravação para ${gravacao.radios.nome}: ${errorMessage}`);
            }
            await supabase.from('gravacoes').update({ status: 'erro', erro: errorMessage }).eq('id', gravacao.id);
        }
      }

    } catch (error) {
      toast({ title: 'Erro ao iniciar gravações', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
      <form onSubmit={handleSubmit}>
        <Card className="p-6 md:p-8 bg-slate-800/40 border-slate-700/60 space-y-8">
          <div>
            <Label className="text-xl font-bold text-white">Localização</Label>
            <p className="text-sm text-slate-400 mb-4">Filtre as rádios por estado e cidade para a gravação.</p>
            <div className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-4 mb-2">
               <div className="w-full md:w-1/2">
                   <Label htmlFor="estado" className="flex items-center gap-2 mb-1"><Globe className="w-4 h-4" /> Estado</Label>
                   <Select name="estado" value={config.estado} onValueChange={(v) => handleSelectChange('estado', v)}>
                      <SelectTrigger id="estado"><SelectValue placeholder="Selecione um estado..."/></SelectTrigger>
                      <SelectContent>
                        {estadosUnicos.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                      </SelectContent>
                   </Select>
               </div>
               <div className="w-full md:w-1/2">
                   <Label htmlFor="cidade" className="flex items-center gap-2 mb-1"><MapPin className="w-4 h-4" /> Cidade (Opcional)</Label>
                   <Select name="cidade" value={config.cidade} onValueChange={(v) => handleSelectChange('cidade', v)} disabled={!config.estado}>
                      <SelectTrigger id="cidade"><SelectValue placeholder="Selecione uma cidade..."/></SelectTrigger>
                      <SelectContent>
                        {cidadesDoEstado.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                      </SelectContent>
                   </Select>
               </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="hora_inicio" className="flex items-center gap-2"><Clock className="w-4 h-4" /> Hora de Início</Label>
                <Input type="time" id="hora_inicio" name="hora_inicio" value={config.hora_inicio} onChange={handleInputChange} className="input" required />
              </div>
              <div>
                <Label htmlFor="hora_fim" className="flex items-center gap-2"><Clock className="w-4 h-4" /> Hora de Fim</Label>
                <Input type="time" id="hora_fim" name="hora_fim" value={config.hora_fim} onChange={handleInputChange} className="input" required />
              </div>
          </div>

          <div>
             <Label className="flex items-center gap-2 mb-2"><Repeat className="w-4 h-4" /> Recorrência</Label>
             <Select name="tipo_recorrencia" value={config.tipo_recorrencia} onValueChange={v => handleSelectChange('tipo_recorrencia', v)}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                    <SelectItem value="none">Gravação Única</SelectItem>
                    <SelectItem value="daily">Diariamente</SelectItem>
                    <SelectItem value="weekly">Semanalmente</SelectItem>
                </SelectContent>
             </Select>
          </div>

          {config.tipo_recorrencia === 'none' && (
             <div>
                <Label htmlFor="data_inicio">Data da Gravação</Label>
                <Input type="date" id="data_inicio" name="data_inicio" value={config.data_inicio} onChange={handleInputChange} className="input" required />
            </div>
          )}

          {config.tipo_recorrencia === 'weekly' && (
            <div>
              <Label>Dias da Semana</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {DIAS_SEMANA_OPTIONS.map(dia => (
                  <button key={dia.id} type="button" onClick={() => handleDiasSemanaChange(dia.id)}
                    className={`px-3 py-2 text-sm rounded-md transition-all ${config.dias_da_semana.includes(dia.id) ? 'bg-cyan-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
                    {dia.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xl font-bold text-white">Limite de Estações</Label>
            <p className="text-sm text-slate-400 mb-4">Controle quantas estações serão gravadas ao mesmo tempo.</p>
            <div className="flex items-center p-3 rounded-md bg-slate-900/50">
                <input type="checkbox" id="limiteEstacoes" name="limiteEstacoes" checked={config.limiteEstacoes} onChange={handleInputChange} className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500" />
                <Label htmlFor="limiteEstacoes" className="ml-3 flex-1 text-white">Limitar para</Label>
                <Input type="number" name="numeroEstacoes" value={config.numeroEstacoes} onChange={handleInputChange} className="w-24 bg-slate-800 text-white" min="1" disabled={!config.limiteEstacoes} />
                <span className="ml-2 text-slate-400">estações no máximo</span>
            </div>
          </div>
          <div className="pt-6 border-t border-slate-700/60 flex justify-end">
            <Button type="submit" className="btn-primary" disabled={loading}>
              {loading ? (
                <><Loader className="w-5 h-5 mr-2 animate-spin" />Iniciando...</>
              ) : (
                <><Layers className="w-5 h-5 mr-2" /> Iniciar Gravação em Massa</>
              )}
            </Button>
          </div>
        </Card>
      </form>
    </motion.div>
  );
};

export default NovaGravacao;