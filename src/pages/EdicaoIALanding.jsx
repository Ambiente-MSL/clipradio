import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Bot, ListVideo, ArrowRight } from 'lucide-react';

const EdicaoIALanding = () => {
  return (
    <>
      <Helmet>
        <title>Edição com IA - Gestor de Rádios</title>
        <meta name="description" content="Acesse suas gravações para começar a editar com o poder da Inteligência Artificial." />
      </Helmet>
      <div className="container mx-auto max-w-4xl px-4 py-16 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            type: "spring",
            stiffness: 260,
            damping: 20,
          }}
          className="flex flex-col items-center"
        >
          <div className="p-4 bg-purple-500/20 rounded-full mb-6">
            <Bot className="w-16 h-16 text-purple-400" />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold gradient-text mb-4">
            Edição com Inteligência Artificial
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-slate-300 mb-8">
            Para começar a cortar seus áudios com o poder da IA, você precisa primeiro selecionar uma gravação. Todas as suas gravações concluídas estão disponíveis na página de Gravações.
          </p>
          <Link to="/gravacoes">
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-lg px-8 py-6 group">
              <ListVideo className="w-6 h-6 mr-3 transition-transform duration-300 group-hover:translate-x-1" />
              Ir para Minhas Gravações
              <ArrowRight className="w-6 h-6 ml-3 transition-transform duration-300 group-hover:translate-x-1" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </>
  );
};

export default EdicaoIALanding;