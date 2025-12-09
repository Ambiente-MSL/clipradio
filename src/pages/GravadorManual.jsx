import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { AlertCircle, Radio, Clock, Info } from 'lucide-react';

export default function GravadorManual() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [radios, setRadios] = useState([]);
  const [selectedRadio, setSelectedRadio] = useState('');
  const [duration, setDuration] = useState(60);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingRadios, setIsFetchingRadios] = useState(true);

  useEffect(() => {
    const fetchRadios = async () => {
      if (!user) return;
      setIsFetchingRadios(true);
      try {
        const { data, error } = await supabase
          .from('radios')
          .select('id, nome')
          .eq('user_id', user.id)
          .order('nome', { ascending: true });

        if (error) throw error;
        setRadios(data);
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Erro ao buscar rádios",
          description: error.message,
        });
      } finally {
        setIsFetchingRadios(false);
      }
    };

    fetchRadios();
  }, [user, toast]);

  const handleStartRecording = async () => {
    if (!selectedRadio || !duration || duration < 1 || duration > 240) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Por favor, selecione uma rádio e defina uma duração válida (1-240 minutos).",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data: gravacao, error: createError } = await supabase
        .from('gravacoes')
        .insert({
          user_id: user.id,
          radio_id: selectedRadio,
          status: 'iniciando',
          tipo: 'manual',
          duracao_minutos: duration,
        })
        .select('id, user_id')
        .single();

      if (createError) throw createError;

      const { error: invokeError } = await supabase.functions.invoke('record-stream', {
        body: {
          recording_id: gravacao.id,
          user_id: gravacao.user_id,
        },
      });

      if (invokeError) {
        throw invokeError;
      }

      toast({
        title: "Gravação iniciada!",
        description: "Sua gravação manual começou em segundo plano.",
      });
      setSelectedRadio('');
      setDuration(60);

    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Erro ao iniciar gravação:", error);
      }
      let errorMessage = "Ocorreu uma falha desconhecida.";

      if (error.context && typeof error.context.json === 'function') {
        try {
          const errorJson = await error.context.json();
          errorMessage = errorJson.error || error.message;
        } catch (e) {
          errorMessage = error.message;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        variant: "destructive",
        title: "Erro ao iniciar gravação",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Gravação Manual - Gestor de Rádios</title>
        <meta name="description" content="Inicie uma gravação de rádio manualmente a qualquer momento." />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="container mx-auto max-w-4xl px-4 py-8"
      >
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-slate-50">Gravação Manual</h1>
        </div>

        <Card className="bg-slate-900/70 border-slate-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-4">
              <Radio className="w-8 h-8 text-cyan-400" />
              <div>
                <CardTitle className="text-2xl font-semibold text-slate-50">Iniciar Nova Gravação</CardTitle>
                <CardDescription className="text-slate-400">
                  Selecione uma rádio e a duração para começar a gravar imediatamente.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="radio-select" className="text-slate-300">Rádio</Label>
                <Select
                  value={selectedRadio}
                  onValueChange={setSelectedRadio}
                  disabled={isFetchingRadios || isLoading}
                >
                  <SelectTrigger id="radio-select" className="w-full bg-slate-800 border-slate-700 text-slate-50">
                    <SelectValue placeholder={isFetchingRadios ? "Carregando rádios..." : "Selecione uma rádio"} />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-50">
                    {radios.map((radio) => (
                      <SelectItem key={radio.id} value={radio.id}>
                        {radio.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration" className="text-slate-300">Duração da Gravação (em minutos)</Label>
                <Input
                  id="duration"
                  type="number"
                  value={duration}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (!isNaN(value) && value >= 1 && value <= 240) {
                      setDuration(value);
                    }
                  }}
                  min="1"
                  max="240"
                  className="bg-slate-800 border-slate-700 text-slate-50"
                  disabled={isLoading}
                  placeholder="Entre 1 e 240 minutos"
                />
              </div>
              <Button
                onClick={handleStartRecording}
                disabled={isLoading || isFetchingRadios || !selectedRadio}
                className="w-full bg-cyan-500 hover:bg-cyan-600 text-slate-900 font-bold text-lg py-6 transition-all duration-300 ease-in-out transform hover:scale-105"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <AlertCircle className="animate-spin mr-2 h-5 w-5" />
                    Iniciando...
                  </div>
                ) : (
                  <div className="flex items-center justify-center">
                    <Clock className="mr-2 h-5 w-5" />
                    Gravar Agora
                  </div>
                )}
              </Button>
            </div>
            <div className="mt-6 flex items-center gap-3 rounded-lg border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-300">
              <Info className="h-5 w-5 flex-shrink-0" />
              <span>A gravação começará em segundo plano. Você pode acompanhar o status na página de <strong className="font-semibold">Gravações</strong>.</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
}