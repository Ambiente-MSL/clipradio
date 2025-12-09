import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Power, Clock, AlertTriangle, CheckCircle2, Loader, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { format } from 'date-fns';

const SchedulerStatus = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('Aguardando');
  const [nextCheck, setNextCheck] = useState(null);
  const [lastCheck, setLastCheck] = useState(null);
  const intervalRef = useRef(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const addLog = (message, type = 'info') => {
    const timestamp = format(new Date(), 'HH:mm:ss');
    setLogs(prev => [{ timestamp, message, type }, ...prev.slice(0, 99)]);
  };
  
  const runScheduler = useCallback(async () => {
    if (!user) {
      addLog('Usuário não autenticado. Pausando agendador.', 'error');
      setIsRunning(false);
      return;
    }

    setStatus('Verificando...');
    setLastCheck(new Date());
    addLog('Invocando a Edge Function radio-scheduler...', 'info');

    try {
      // The `radio-scheduler` function will need to be updated with the new schema.
      // For now, it might produce errors if not updated on the Supabase side.
      const { data, error } = await supabase.functions.invoke('radio-scheduler', {
        body: { userId: user.id },
      });

      if (error) throw error;
      
      addLog(`Função executada: ${data.message || 'Nenhum retorno da função.'}`, 'success');
    } catch (error) {
      addLog(`Erro ao invocar a função: ${error.message}`, 'error');
      toast({
        title: "Erro no Agendador",
        description: error.message,
        variant: "destructive",
      });
    } finally {
        setStatus('Aguardando');
        setNextCheck(new Date(Date.now() + 60000));
    }
  }, [user, toast]);
  
  const startScheduler = () => {
    addLog('Agendador iniciado. Verificando a cada minuto.');
    setIsRunning(true);
    runScheduler();
    intervalRef.current = setInterval(runScheduler, 60000);
  };
  
  const stopScheduler = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setIsRunning(false);
    setStatus('Parado');
    setNextCheck(null);
    addLog('Agendador parado pelo usuário.');
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
  
  const getIconForLog = (type) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'error': return <AlertTriangle className="w-5 h-5 text-red-400" />;
      case 'info': return <Clock className="w-5 h-5 text-cyan-400" />;
      default: return <Clock className="w-5 h-5 text-slate-500" />;
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-4xl font-bold gradient-text mb-2">Status do Agendador</h1>
          <p className="text-slate-400 text-lg">Monitore em tempo real a execução das suas gravações agendadas</p>
        </motion.div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="md:col-span-1 card flex flex-col items-center justify-center text-center">
                <Zap className={`w-20 h-20 mb-4 transition-colors duration-500 ${isRunning ? 'text-green-400' : 'text-slate-600'}`} />
                <h2 className="text-2xl font-bold mb-2">{isRunning ? 'Agendador Ativo' : 'Agendador Parado'}</h2>
                <p className="text-slate-400 mb-6">{isRunning ? 'Verificando por gravações a cada minuto.' : 'Clique em iniciar para começar a verificação.'}</p>
                {isRunning ? (
                    <Button onClick={stopScheduler} className="btn btn-danger w-full">
                        <Power className="mr-2 h-4 w-4" /> Parar Agendador
                    </Button>
                ) : (
                    <Button onClick={startScheduler} className="btn btn-primary w-full">
                        <Play className="mr-2 h-4 w-4" /> Iniciar Agendador
                    </Button>
                )}
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="md:col-span-2 card space-y-4">
                <div className="flex justify-between items-center text-slate-400">
                    <span>Última verificação:</span>
                    <span className="font-mono text-white">{lastCheck ? format(lastCheck, 'HH:mm:ss') : 'N/A'}</span>
                </div>
                 <div className="flex justify-between items-center text-slate-400">
                    <span>Próxima verificação:</span>
                    <span className="font-mono text-white">{nextCheck ? format(nextCheck, 'HH:mm:ss') : 'N/A'}</span>
                </div>
                 <div className="flex justify-between items-center text-slate-400">
                    <span>Status atual:</span>
                    <span className="font-semibold text-white flex items-center">
                        {status === 'Verificando...' && <Loader className="w-4 h-4 mr-2 animate-spin text-cyan-400" />}
                        {status}
                    </span>
                </div>
                <div className="!mt-6 bg-yellow-900/20 border border-yellow-700/50 p-3 rounded-lg flex items-center text-yellow-300 text-sm">
                    <AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0" />
                    <span>Manter esta aba aberta para que o agendador continue funcionando.</span>
                </div>
            </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card mt-8">
            <h3 className="text-xl font-bold mb-4">Logs de Atividade</h3>
            <div className="max-h-80 overflow-y-auto pr-2 space-y-3">
                <AnimatePresence>
                    {logs.length > 0 ? logs.map((log, index) => (
                        <motion.div 
                            key={index}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.3 }}
                            className="flex items-center space-x-4 text-sm"
                        >
                            {getIconForLog(log.type)}
                            <span className="font-mono text-slate-500">{log.timestamp}</span>
                            <span className="text-slate-300 flex-1">{log.message}</span>
                        </motion.div>
                    )) : (
                        <div className="text-center py-10 text-slate-500">
                            <Clock className="w-12 h-12 mx-auto mb-2" />
                            <p>Nenhuma atividade registrada ainda. Inicie o agendador.</p>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
      </div>
    </div>
  );
};

export default SchedulerStatus;