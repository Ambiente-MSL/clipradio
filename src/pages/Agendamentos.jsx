import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, Plus, Edit, Trash2, Power, PowerOff, Loader, AlertCircle, CheckCircle, Repeat, FileDown } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import apiClient from '@/lib/apiClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatInTimeZone } from 'date-fns-tz';
import AgendamentoForm from '@/components/AgendamentoForm';

const Agendamentos = () => {
  const [agendamentos, setAgendamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportFormat, setReportFormat] = useState(null);
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchAgendamentos = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await apiClient.getAgendamentos();
      setAgendamentos(data || []);
    } catch (error) {
      toast({ title: "Erro ao buscar agendamentos", description: error.message, variant: "destructive" });
    }
    setLoading(false);
  }, [toast, user]);

  useEffect(() => {
    if (user) {
      fetchAgendamentos();
    }
  }, [user, fetchAgendamentos]);

  const handleDelete = async (id) => {
    setIsDeleting(true);
    toast({ title: 'Removendo agendamento...', description: 'Aguarde um momento.' });

    try {
      await apiClient.deleteAgendamento(id);
      toast({ title: "Agendamento removido com sucesso!", variant: 'success' });
      fetchAgendamentos();
    } catch (error) {
      toast({ title: "Erro ao remover agendamento", description: error.message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    try {
      await apiClient.toggleAgendamentoStatus(id);
      const newStatus = currentStatus === 'agendado' ? 'inativo' : 'agendado';
      toast({ title: newStatus === 'agendado' ? "Agendamento ativado" : "Agendamento desativado" });
      fetchAgendamentos();
    } catch (error) {
      toast({ title: "Erro ao alterar status", description: error.message, variant: "destructive" });
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
      if (!agendamento.data_inicio) return 'Único';
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
        str = (agendamento.dias_semana || []).sort().map(d => dias[d]).join(', ');
        break;
      default: str = 'Recorrente';
    }
    return str;
  };

  const formatAgendamentoDisplay = (agendamento) => {
    let localHoraInicio = '';
    let localHoraFim = '';
    try {
      const inicio = agendamento.data_inicio ? new Date(agendamento.data_inicio) : null;
      const duracaoMin = agendamento.duracao_minutos || 0;
      const fim = inicio ? new Date(inicio.getTime() + duracaoMin * 60000) : null;
      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (inicio) {
        localHoraInicio = formatInTimeZone(inicio, userTimeZone, 'HH:mm');
      }
      if (fim) {
        localHoraFim = formatInTimeZone(fim, userTimeZone, 'HH:mm');
      }
    } catch (timezoneError) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Fallback para horário devido a erro de timezone:', timezoneError);
      }
    }

    return {
      horario_display: `${localHoraInicio} - ${localHoraFim}`,
      statusInfo: getStatusInfo(agendamento.status),
      recorrencia_display: formatRecorrencia(agendamento)
    };
  };
  
  const handleAddNew = () => {
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    fetchAgendamentos(); // Atualiza a lista após fechar o modal
  };

  const openReportModal = (format) => {
    const today = new Date().toISOString().split('T')[0];
    setReportFormat(format);
    setReportStartDate((prev) => prev || today);
    setReportEndDate((prev) => prev || today);
    setIsReportModalOpen(true);
  };

  const handleExport = async (format, { startDate, endDate }) => {
    setExportingFormat(format);
    try {
      const { blob, filename } = await apiClient.downloadAgendamentosReport(format, { startDate, endDate });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast({ title: `Relat?rio ${format.toUpperCase()} gerado`, description: 'Download iniciado.' });
      return true;
    } catch (error) {
      toast({ title: 'Erro ao gerar relat?rio', description: error.message, variant: 'destructive' });
      return false;
    } finally {
      setExportingFormat(null);
    }
  };

  const handleConfirmReport = async () => {
    if (!reportFormat) return;
    if (!reportStartDate || !reportEndDate) {
      toast({ title: 'Selecione o periodo', description: 'Informe data inicial e final.', variant: 'destructive' });
      return;
    }
    if (reportStartDate > reportEndDate) {
      toast({ title: 'Periodo invalido', description: 'A data inicial deve ser anterior ou igual a data final.', variant: 'destructive' });
      return;
    }
    const success = await handleExport(reportFormat, { startDate: reportStartDate, endDate: reportEndDate });
    if (success) {
      setIsReportModalOpen(false);
    }
  };


  return (
    <>
      <Helmet>
        <title>Agendamentos</title>
        <meta name="description" content="Gerencie e configure gravações automáticas para suas rádios." />
      </Helmet>
      <div className="min-h-screen p-6">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold gradient-text mb-2">Agendamentos</h1>
              <p className="text-slate-400 text-lg">Configure gravações recorrentes para suas rádios</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="border-slate-700 text-slate-100 hover:border-cyan-400"
                onClick={() => openReportModal('csv')}
                disabled={exportingFormat !== null}
              >
                <FileDown className="w-4 h-4 mr-2" />
                {exportingFormat === 'csv' ? 'Gerando...' : 'CSV'}
              </Button>
              <Button
                variant="outline"
                className="border-slate-700 text-slate-100 hover:border-cyan-400"
                onClick={() => openReportModal('pdf')}
                disabled={exportingFormat !== null}
              >
                <FileDown className="w-4 h-4 mr-2" />
                {exportingFormat === 'pdf' ? 'Gerando...' : 'PDF'}
              </Button>
              <Button onClick={handleAddNew} className="btn btn-primary">
                <Plus className="w-5 h-5 mr-2"/>
                Novo Agendamento
              </Button>
            </div>
          </motion.div>

          <div className="grid grid-cols-1">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white flex items-center"><Calendar className="w-6 h-6 mr-3 text-blue-400" />Lista de agendamentos</h2>
                <span className="bg-slate-700 text-slate-300 px-3 py-1 rounded-full text-sm font-medium">{agendamentos.length} agendamentos</span>
              </div>
              {loading ? (
                <div className="flex justify-center items-center h-48"><Loader className="w-8 h-8 animate-spin text-cyan-400" /></div>
              ) : agendamentos.length === 0 ? (
                <div className="text-center py-12"><Calendar className="w-16 h-16 text-slate-600 mx-auto mb-4" /><p className="text-slate-400 text-lg">Nenhum agendamento criado</p><p className="text-slate-500">Clique em "Novo agendamento" para começar.</p></div>
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
                                  Esta ação é irreversível e excluirá o agendamento.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(agendamento.id)} disabled={isDeleting}>
                                  {isDeleting ? 'Excluindo...' : 'Excluir'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </motion.div>
                  );
                  })}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      <Dialog open={isReportModalOpen} onOpenChange={setIsReportModalOpen}>
        <DialogContent className="sm:max-w-[420px] bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Periodo do relatorio {reportFormat ? reportFormat.toUpperCase() : ''}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="report-start">Data inicial</Label>
              <Input
                id="report-start"
                type="date"
                value={reportStartDate}
                onChange={(event) => setReportStartDate(event.target.value)}
                className="bg-slate-900 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-end">Data final</Label>
              <Input
                id="report-end"
                type="date"
                value={reportEndDate}
                onChange={(event) => setReportEndDate(event.target.value)}
                className="bg-slate-900 border-slate-700 text-white"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="border-slate-700 text-slate-200 hover:border-cyan-400"
              onClick={() => setIsReportModalOpen(false)}
              disabled={exportingFormat !== null}
            >
              Cancelar
            </Button>
            <Button onClick={handleConfirmReport} disabled={exportingFormat !== null}>
              {exportingFormat ? 'Gerando...' : `Gerar ${reportFormat ? reportFormat.toUpperCase() : 'relatorio'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Modal de Novo Agendamento */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-800/95 border-slate-700/60 backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center text-white text-xl">
              <Calendar className="w-6 h-6 mr-3 text-cyan-400" />
              Criar Novo Agendamento
            </DialogTitle>
          </DialogHeader>
          <AgendamentoForm onSuccess={handleModalClose} />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Agendamentos;

