import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader, Save, Clock, Repeat, Radio as RadioIcon } from 'lucide-react';
import { formatInTimeZone, toDate } from 'date-fns-tz';

const AgendamentoForm = ({ agendamentoIdParam }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [radios, setRadios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    radio_id: '',
    hora_inicio: '09:00',
    hora_fim: '10:00',
    tipo_recorrencia: 'none',
    data_inicio: new Date().toISOString().split('T')[0],
    dias_da_semana: [],
  });

  const DIAS_SEMANA_OPTIONS = [
    { id: 1, label: 'Segunda-feira' },
    { id: 2, label: 'Terça-feira' },
    { id: 3, label: 'Quarta-feira' },
    { id: 4, label: 'Quinta-feira' },
    { id: 5, label: 'Sexta-feira' },
    { id: 6, label: 'Sábado' },
    { id: 0, label: 'Domingo' },
  ];

  const fetchInitialData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data: radioData, error: radioError } = await supabase
        .from('radios')
        .select('id, nome')
        .eq('user_id', user.id);
      if (radioError) throw radioError;
      setRadios(radioData);

      if (agendamentoIdParam) {
        setEditingId(agendamentoIdParam);
        const { data: agendamentoData, error: agendamentoError } = await supabase
          .from('agendamentos')
          .select('*')
          .eq('id', agendamentoIdParam)
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (agendamentoError) throw agendamentoError;

        if (agendamentoData) {
            let localHoraInicio, localHoraFim;
            
            try {
              const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
              localHoraInicio = formatInTimeZone(`1970-01-01T${agendamentoData.hora_inicio}Z`, userTimeZone, 'HH:mm');
              localHoraFim = formatInTimeZone(`1970-01-01T${agendamentoData.hora_fim}Z`, userTimeZone, 'HH:mm');
            } catch (timezoneError) {
              // Fallback para horários UTC se conversão falhar
              localHoraInicio = agendamentoData.hora_inicio.substring(0, 5);
              localHoraFim = agendamentoData.hora_fim.substring(0, 5);
              if (process.env.NODE_ENV === 'development') {
                console.warn('Fallback para horário UTC devido a erro de timezone:', timezoneError);
              }
            }

            setFormData({
                radio_id: agendamentoData.radio_id,
                hora_inicio: localHoraInicio,
                hora_fim: localHoraFim,
                tipo_recorrencia: agendamentoData.tipo_recorrencia,
                data_inicio: agendamentoData.data_inicio,
                dias_da_semana: agendamentoData.dias_da_semana || [],
            });
        } else {
            toast({ title: "Agendamento não encontrado", description: "Não foi possível carregar os dados para edição.", variant: "destructive" });
            navigate('/agendamentos');
        }
      }
    } catch (error) {
      toast({ title: "Erro ao carregar dados", description: error.message, variant: "destructive" });
      navigate('/agendamentos');
    } finally {
      setLoading(false);
    }
  }, [user, toast, navigate, agendamentoIdParam]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSelectChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleDiasSemanaChange = (dia) => {
    const { dias_da_semana } = formData;
    const newDias = dias_da_semana.includes(dia)
      ? dias_da_semana.filter(d => d !== dia)
      : [...dias_da_semana, dia];
    setFormData(prev => ({ ...prev, dias_da_semana: newDias }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.radio_id) {
      toast({ variant: "destructive", title: "Erro de Validação", description: "Por favor, selecione uma rádio." });
      return;
    }
    if (formData.tipo_recorrencia === 'weekly' && formData.dias_da_semana.length === 0) {
      toast({ variant: "destructive", title: "Erro de Validação", description: "Selecione pelo menos um dia da semana." });
      return;
    }
    
    // Validar se horário de início não é posterior ao horário de fim
    const [horaInicio, minutoInicio] = formData.hora_inicio.split(':').map(Number);
    const [horaFim, minutoFim] = formData.hora_fim.split(':').map(Number);
    const minutosInicio = horaInicio * 60 + minutoInicio;
    const minutosFim = horaFim * 60 + minutoFim;
    
    if (minutosInicio >= minutosFim) {
      toast({ 
        variant: "destructive", 
        title: "Erro de Validação", 
        description: "O horário de início deve ser anterior ao horário de fim." 
      });
      return;
    }

    setIsSubmitting(true);
    
    let utcHoraInicio, utcHoraFim;
    
    try {
      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const dataRef = formData.data_inicio || new Date().toISOString().split('T')[0];

      utcHoraInicio = formatInTimeZone(toDate(`${dataRef}T${formData.hora_inicio}`, { timeZone: userTimeZone }), 'UTC', 'HH:mm:ss');
      utcHoraFim = formatInTimeZone(toDate(`${dataRef}T${formData.hora_fim}`, { timeZone: userTimeZone }), 'UTC', 'HH:mm:ss');
    } catch (timezoneError) {
      // Fallback para horários locais se conversão de timezone falhar
      utcHoraInicio = `${formData.hora_inicio}:00`;
      utcHoraFim = `${formData.hora_fim}:00`;
      if (process.env.NODE_ENV === 'development') {
        console.warn('Fallback para horário local devido a erro de timezone:', timezoneError);
      }
    }

    const payload = {
      ...formData,
      hora_inicio: utcHoraInicio,
      hora_fim: utcHoraFim,
      user_id: user.id,
      status: 'agendado',
    };

    let error;
    if (editingId) {
      const { error: updateError } = await supabase.from('agendamentos').update(payload).eq('id', editingId);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('agendamentos').insert(payload);
      error = insertError;
    }

    if (error) {
      toast({ variant: "destructive", title: "Erro ao salvar", description: error.message });
    } else {
      toast({ title: "Sucesso!", description: `Agendamento ${editingId ? 'atualizado' : 'criado'} com sucesso.` });
      navigate('/agendamentos');
    }

    setIsSubmitting(false);
  }

  if (loading) {
    return <div className="flex justify-center items-center h-48"><Loader className="w-8 h-8 animate-spin text-cyan-400" /></div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
        <div>
            <Label htmlFor="radio_id" className="flex items-center gap-2 mb-1"><RadioIcon className="w-4 h-4" /> Rádio</Label>
            <Select name="radio_id" value={formData.radio_id} onValueChange={v => handleSelectChange('radio_id', v)} disabled={loading || radios.length === 0}>
                <SelectTrigger id="radio_id"><SelectValue placeholder="Selecione uma rádio..." /></SelectTrigger>
                <SelectContent>
                    {radios.map(radio => (
                        <SelectItem key={radio.id} value={radio.id}>{radio.nome}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <Label htmlFor="hora_inicio" className="flex items-center gap-2"><Clock className="w-4 h-4" /> Hora de Início</Label>
                <Input type="time" id="hora_inicio" name="hora_inicio" value={formData.hora_inicio} onChange={handleInputChange} className="input" required />
            </div>
            <div>
                <Label htmlFor="hora_fim" className="flex items-center gap-2"><Clock className="w-4 h-4" /> Hora de Fim</Label>
                <Input type="time" id="hora_fim" name="hora_fim" value={formData.hora_fim} onChange={handleInputChange} className="input" required />
            </div>
        </div>
        
        <div>
            <Label className="flex items-center gap-2 mb-1"><Repeat className="w-4 h-4" /> Recorrência</Label>
            <Select name="tipo_recorrencia" value={formData.tipo_recorrencia} onValueChange={v => handleSelectChange('tipo_recorrencia', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="none">Gravação Única</SelectItem>
                    <SelectItem value="daily">Diariamente</SelectItem>
                    <SelectItem value="weekly">Semanalmente</SelectItem>
                </SelectContent>
            </Select>
        </div>

        {formData.tipo_recorrencia === 'none' && (
            <div>
                <Label htmlFor="data_inicio">Data da Gravação</Label>
                <Input type="date" id="data_inicio" name="data_inicio" value={formData.data_inicio} onChange={handleInputChange} className="input" required />
            </div>
        )}

        {formData.tipo_recorrencia === 'weekly' && (
            <div>
              <Label>Dias da Semana</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {DIAS_SEMANA_OPTIONS.map(dia => (
                  <button key={dia.id} type="button" onClick={() => handleDiasSemanaChange(dia.id)}
                    className={`px-3 py-2 text-sm rounded-md transition-all ${formData.dias_da_semana.includes(dia.id) ? 'bg-cyan-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
                    {dia.label}
                  </button>
                ))}
              </div>
            </div>
        )}

        <Button type="submit" className="w-full btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? <><Loader className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4 mr-2" /> Salvar Agendamento</>}
        </Button>
    </form>
  );
};

export default AgendamentoForm;