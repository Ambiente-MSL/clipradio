
import React from 'react';
import { motion } from 'framer-motion';
import { Headphones, Clock, FileArchive, Disc } from 'lucide-react';

const StatCard = ({ icon, value, unit, delay }) => (
  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay }} className="card flex flex-col items-center justify-center p-6 text-center">
    {icon}
    <span className="text-4xl font-bold text-foreground">{value}</span>
    <span className="text-muted-foreground text-sm">{unit}</span>
  </motion.div>
);

const GravacoesStats = ({ stats }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
    <StatCard icon={<Headphones className="w-12 h-12 text-primary mb-3" />} value={stats.totalGravacoes} unit="Gravações" delay={0.1} />
    <StatCard icon={<Clock className="w-12 h-12 text-blue-400 mb-3" />} value={(stats.totalDuration / 60).toFixed(0)} unit="Minutos Totais" delay={0.2} />
    <StatCard icon={<FileArchive className="w-12 h-12 text-green-400 mb-3" />} value={stats.totalSize.toFixed(1)} unit="MB Totais" delay={0.3} />
    <StatCard icon={<Disc className="w-12 h-12 text-destructive mb-3" />} value={stats.uniqueRadios} unit="Rádios Gravadas" delay={0.4} />
  </div>
);

export default GravacoesStats;
