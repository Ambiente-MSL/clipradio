import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Helmet } from 'react-helmet';
import AgendamentoForm from '@/components/AgendamentoForm';

const NovoAgendamento = () => {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>Novo Agendamento - IA Recorder</title>
        <meta name="description" content="Crie um novo agendamento de gravação para uma de suas rádios." />
      </Helmet>
      <div className="min-h-screen p-6 flex justify-center items-center">
        <div className="w-full max-w-2xl">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="bg-slate-800/40 border-slate-700/60">
              <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center text-white">
                      <Calendar className="w-6 h-6 mr-3 text-cyan-400" />
                      Criar Novo Agendamento
                    </CardTitle>
                    <Button variant="ghost" size="icon" onClick={() => navigate('/agendamentos')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </div>
              </CardHeader>
              <CardContent>
                <AgendamentoForm />
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default NovoAgendamento;