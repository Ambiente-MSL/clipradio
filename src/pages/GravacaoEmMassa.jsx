import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import NovaGravacao from '@/components/massa/NovaGravacao';
import LotesAnteriores from '@/components/massa/LotesAnteriores';
import MonitorDeGravacao from '@/components/massa/MonitorDeGravacao';
import { Layers } from 'lucide-react';

const GravacaoEmMassa = ({ setGlobalAudioTrack }) => {
  const [activeTab, setActiveTab] = useState('nova');
  const [activeBatch, setActiveBatch] = useState(null);
  const [initialBatchRecordings, setInitialBatchRecordings] = useState([]);
  
  const handleBatchStart = (batchId, radios) => {
    setActiveBatch(batchId);
    const placeholderRecordings = radios.map(radio => ({
      id: crypto.randomUUID(),
      batch_id: batchId,
      status: 'iniciando',
      criado_em: new Date().toISOString(),
      radios: { nome: radio.nome },
      user_id: radio.user_id,
      arquivo_nome: 'placeholder.aac'
    }));
    setInitialBatchRecordings(placeholderRecordings);
  };
  
  if (activeBatch) {
    return <MonitorDeGravacao batchId={activeBatch} initialRecordings={initialBatchRecordings} setActiveBatch={setActiveBatch} setGlobalAudioTrack={setGlobalAudioTrack} />;
  }

  return (
    <>
      <Helmet>
        <title>Gravação em Massa - IA Recorder</title>
        <meta name="description" content="Configure e inicie gravações em massa de várias estações de rádio." />
      </Helmet>
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white flex items-center">
            <Layers className="w-8 h-8 mr-3 text-cyan-400" />
            Gravação em Massa
          </h1>
          <p className="text-md text-slate-400">
            Crie novos lotes de gravação ou revise os lotes anteriores.
          </p>
        </motion.div>

        <div className="mb-6 flex space-x-2 border-b border-slate-700">
          <button
            onClick={() => setActiveTab('nova')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'nova' ? 'border-b-2 border-cyan-400 text-cyan-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            Nova Gravação
          </button>
          <button
            onClick={() => setActiveTab('lotes')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'lotes' ? 'border-b-2 border-cyan-400 text-cyan-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            Lotes Anteriores
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'nova' ? (
              <NovaGravacao onBatchStart={handleBatchStart} />
            ) : (
              <LotesAnteriores setGlobalAudioTrack={setGlobalAudioTrack} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
};

export default GravacaoEmMassa;