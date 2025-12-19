import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { AlertCircle, Radio, Clock, Info } from 'lucide-react';
import apiClient from '@/lib/apiClient';

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
      setIsFetchingRadios(true);
      try {
        const data = await apiClient.getRadios();
        setRadios(data || []);
      } catch (error) {
        toast({ variant: 'destructive', title: 'Erro ao buscar rádios', description: error.message });
      } finally {
        setIsFetchingRadios(false);
      }
    };

    if (user) {
      fetchRadios();
    }
  }, [user, toast]);

  const handleStartRecording = async () => {
    if (!selectedRadio || !duration || duration < 1 || duration > 240) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Selecione uma rádio e defina uma duração válida (1-240 minutos).",
      });
      return;
    }

    setIsLoading(true);
    try {
      const gravacao = await apiClient.createGravacao({
        radio_id: selectedRadio,
        duracao_minutos: duration,
        status: 'iniciando',
        tipo: 'manual',
      });

      await apiClient.startRecording(gravacao.id);

      toast({
        title: "Gravação iniciada!",
        description: "Sua gravação manual começou em segundo plano.",
      });
      setSelectedRadio('');
      setDuration(60);

    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao iniciar gravação",
        description: error.message || "Ocorreu uma falha desconhecida.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Gravar manual | Clipradio</title>
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
                    if (!isNaN(value)) {
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
                    Iniciar Gravação
                  </div>
                )}
              </Button>
              <div className="p-4 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300 text-sm flex items-start gap-3">
                <Info className="w-4 h-4 text-cyan-400 mt-1" />
                <div>
                  <p>As gravações são executadas no servidor backend. Você pode acompanhar o status na lista de gravações.</p>
                  <p className="text-slate-400 mt-1">Certifique-se de que a URL do stream está ativa antes de iniciar.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
}

