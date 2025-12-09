import React from "react";
import { Helmet } from "react-helmet";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, ArrowLeft } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import AgendamentoForm from "@/components/AgendamentoForm";

export default function AgendamentoRadio() {
  const { agendamentoId } = useParams();
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>Editar Agendamento - IA Recorder</title>
        <meta name="description" content="Edite um agendamento de rádio existente." />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 max-w-2xl mx-auto"
      >
        <Button variant="ghost" onClick={() => navigate('/agendamentos')} className="mb-4 text-slate-300 hover:text-white">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para Agendamentos
        </Button>
        <Card className="card">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl gradient-text flex items-center justify-center gap-3">
              <Calendar className="w-8 h-8" /> Editar Agendamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
             <AgendamentoForm agendamentoIdParam={agendamentoId} />
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
}