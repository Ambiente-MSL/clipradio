import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, Plus, Edit, Trash2, Power, PowerOff, Loader, AlertCircle, CheckCircle, Repeat } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { formatInTimeZone } from 'date-fns-tz';

const Agendamentos = () => {
  const [agendamentos, setAgendamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchAgendamentos = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('agendamentos')
      .select('*, radios(nome)')
      .eq('user_id', user.id)
      .order('data_inicio', { ascending: false });
    if (error) {
      toast({ title: "Erro ao buscar agendamentos", description: error.message, variant: "destructive" });
    } else {
      setAgendamentos(data || []);
    }
    setLoading(false);
  }, [toast, user]);

  useEffect(() => {
    if (user) {
        fetchAgendamentos();
    }

    const channel = supabase.channel('agendamentos-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos', filter: `user_id=eq.${user?.id}` },
        () => {
          fetchAgendamentos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchAgendamentos]);

  const handleDelete = async (id) => {
    setIsDeleting(true);
    toast({ title: 'Removendo agendamento...', description: 'Aguarde um momento.' });

    const { error } = await supabase.functions.invoke('delete-agendamento', {
      body: JSON.stringify({ agendamento_id: id }),
    });

    if (error) {
      toast({ title: "Erro ao remover agendamento", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Agendamento removido com sucesso!", variant: 'success' });
      fetchAgendamentos();
    }
    setIsDeleting(false);
  };

  const toggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'agendado' ? 'inativo' : 'agendado';
    const { error } = await supabase.from('agendamentos').update({ status: newStatus }).eq('id', id);
    if (error) {
      toast({ title: "Erro ao alterar status", description: error.message, variant: "destructive" });
    } else {
      toast({ title: newStatus === 'agendado' ? "Agendamento ativado" : "Agendamento desativado" });
    }
  };
  
  const getStatusInfo = (status) => {
    switch (status) {
      case 'agendado': return { text: 'Agendado', className: 'status-active', icon: <Clock className="w-3 h-3 mr-1" /> };
      case 'concluido': return { text: 'Concluído', className: 'status-completed', icon: <CheckCircle className="w-3 h-3 mr-1" /> };
      case 'em_execucao': return { text: 'Gravando', className: 'status-recording', icon: <Loader className="w-3 h-3 mr-1 animate-spin" /> };
      case 'erro': return { text: 'Erro', className: 'status-error', icon: <AlertCircle className="w-3 h-3 mr-1" /> };
      case 'inativo': return { text: 'Inativo', className: 'status-inactive', icon: <PowerOff className="w-3 h-3 mr-1" /> };
      default: return { text: 'Desconhecido', className: 'status-inactive', icon: null };
    }
  };

  const formatRecorrencia = (agendamento) => {
    if (agendamento.tipo_recorrencia === 'none') {
        const [year, month, day] = agendamento.data_inicio.split('-');
        const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
        const dataFormatada = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
        return `Único - ${dataFormatada}`;
    }
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    let str = '';
    switch (agendamento.tipo_recorrencia) {
        case 'daily': str = 'Diariamente'; break;
        case 'weekly': 
            str = agendamento.dias_da_semana.sort().map(d => dias[d]).join(', ');
            break;
        default: str = 'Recorrente';
    }
    return str;
};

  const formatAgendamentoDisplay = (agendamento) => {
    let localHoraInicio, localHoraFim;
    
    try {
      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      localHoraInicio = formatInTimeZone(`1970-01-01T${agendamento.hora_inicio}Z`, userTimeZone, 'HH:mm');
      localHoraFim = formatInTimeZone(`1970-01-01T${agendamento.hora_fim}Z`, userTimeZone, 'HH:mm');
    } catch (timezoneError) {
      // Fallback para horários UTC se conversão falhar
      localHoraInicio = agendamento.hora_inicio.substring(0, 5);
      localHoraFim = agendamento.hora_fim.substring(0, 5);
      if (process.env.NODE_ENV === 'development') {
        console.warn('Fallback para horário UTC devido a erro de timezone:', timezoneError);
      }
    }

    return {
      horario_display: `${localHoraInicio} - ${localHoraFim}`,
      statusInfo: getStatusInfo(agendamento.status),
      recorrencia_display: formatRecorrencia(agendamento)
    };
  };
  
  const handleAddNew = () => {
    navigate('/novo-agendamento');
  };

  return (
    <>
      <Helmet>
        <title>Agendamentos - IA Recorder</title>
        <meta name="description" content="Gerencie e configure gravações automáticas para suas rádios." />
      </Helmet>
      <div className="min-h-screen p-6">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold gradient-text mb-2">Agendamentos</h1>
              <p className="text-slate-400 text-lg">Configure gravações recorrentes para suas rádios</p>
            </div>
            <Button onClick={handleAddNew} className="btn btn-primary">
              <Plus className="w-5 h-5 mr-2"/>
              Novo Agendamento
            </Button>
          </motion.div>

          <div className="grid grid-cols-1">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white flex items-center"><Calendar className="w-6 h-6 mr-3 text-blue-400" />Lista de Agendamentos</h2>
                <span className="bg-slate-700 text-slate-300 px-3 py-1 rounded-full text-sm font-medium">{agendamentos.length} agendamentos</span>
              </div>
              {loading ? (
                <div className="flex justify-center items-center h-48"><Loader className="w-8 h-8 animate-spin text-cyan-400" /></div>
              ) : agendamentos.length === 0 ? (
                <div className="text-center py-12"><Calendar className="w-16 h-16 text-slate-600 mx-auto mb-4" /><p className="text-slate-400 text-lg">Nenhum agendamento criado</p><p className="text-slate-500">Clique em "Novo Agendamento" para começar.</p></div>
              ) : (
                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                  {agendamentos.map((agendamento, index) => {
                    const { horario_display, statusInfo, recorrencia_display } = formatAgendamentoDisplay(agendamento);
                    return (
                    <motion.div key={agendamento.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 hover:border-blue-500/50 transition-all duration-200">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                              <h3 className="font-semibold text-white">{agendamento.radios?.nome || 'Rádio desconhecida'}</h3>
                            <span className={`flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusInfo.className}`}>
                              {statusInfo.icon}
                              {statusInfo.text}
                            </span>
                          </div>
                          <div className="flex items-center space-x-4 text-slate-400 text-sm">
                            <span className="flex items-center"><Clock className="w-4 h-4 mr-1 inline"/>{horario_display}</span>
                            <span className="flex items-center"><Repeat className="w-4 h-4 mr-1 inline"/>{recorrencia_display}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <button onClick={() => toggleStatus(agendamento.id, agendamento.status)} className={`p-2 rounded-lg transition-all duration-200 ${agendamento.status === 'agendado' ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30' }`} title={agendamento.status === 'agendado' ? 'Desativar' : 'Ativar'}>{agendamento.status === 'agendado' ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}</button>
                          <button onClick={() => navigate(`/agendamento/${agendamento.id}`)} className="p-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-all duration-200" title="Editar"><Edit className="w-4 h-4" /></button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all duration-200" title="Excluir" disabled={isDeleting}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação é irreversível. Todas as gravações associadas a este agendamento também serão excluídas permanentemente.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(agendamento.id)}>
                                  Sim, Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      {agendamento.detalhes_erro && (
                        <div className="w-full mt-2 p-2 bg-yellow-900/50 border-l-4 border-yellow-500 text-yellow-300 text-xs">
                          <strong>Detalhe:</strong> {agendamento.detalhes_erro}
                        </div>
                      )}
                    </motion.div>
                  )})}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Agendamentos;