import React, { useState, useEffect } from "react";
import { Helmet } from "react-helmet";
import { motion } from "framer-motion";
import { Loader2, Server, ShieldCheck, ShieldOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const StatusIndicator = ({ status }) => {
  if (status === "loading") {
    return <Loader2 className="h-6 w-6 animate-spin text-gray-500" />;
  }
  if (status === "online") {
    return <ShieldCheck className="h-6 w-6 text-green-500" />;
  }
  return <ShieldOff className="h-6 w-6 text-red-500" />;
};

const SystemStatus = () => {
  const [status, setStatus] = useState("loading");
  const [lastChecked, setLastChecked] = useState(null);
  const [details, setDetails] = useState(null);
  const { toast } = useToast();

  const checkStatus = async () => {
    setStatus("loading");
    setLastChecked(new Date());

    try {
      const response = await fetch(`${API_URL}/health`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Falha ao consultar healthcheck");
      }

      setStatus(data.status === "ok" ? "online" : "offline");
      setDetails(data.error || `Status do backend: ${data.status}`);
    } catch (error) {
      setStatus("offline");
      setDetails(error.message);
      toast({
        title: "Erro na Verificação",
        description: "Não foi possível obter o status do serviço.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const getStatusText = () => {
    switch (status) {
      case "online":
        return "Todos os sistemas operacionais.";
      case "offline":
        return "Serviço de gravação indisponível.";
      default:
        return "Verificando...";
    }
  };

  return (
    <>
      <Helmet>
        <title>Status do Sistema - IA Recorder</title>
        <meta name="description" content="Verifique o status dos serviços do IA Recorder." />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="container mx-auto max-w-4xl px-4 py-8"
      >
        <h1 className="text-4xl font-bold mb-8 text-center text-gray-800 dark:text-white">
          Status do Sistema
        </h1>
        <Card className="w-full max-w-md mx-auto shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Serviço de Gravação</span>
              <StatusIndicator status={status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 text-lg">
              <Server className="h-5 w-5 text-gray-500" />
              <span>{getStatusText()}</span>
            </div>
            {details && <p className="text-sm text-gray-600 dark:text-gray-300">{details}</p>}
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Última verificação: {lastChecked ? lastChecked.toLocaleString() : "-"}
            </div>
            <Button onClick={checkStatus} variant="outline" className="w-full">
              Recarregar status
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
};

export default SystemStatus;
