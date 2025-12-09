import React, { useState, useEffect } from 'react';
import { Calendar, Clock as ClockIcon } from 'lucide-react';

const Clock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timerId = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timerId);
  }, []);

  const formatDate = (date) => {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 flex items-center justify-between text-slate-300">
      <div className="flex items-center">
        <Calendar className="w-4 h-4 mr-2 text-cyan-400" />
        <span className="text-sm font-medium">{formatDate(time)}</span>
      </div>
      <div className="flex items-center">
        <ClockIcon className="w-4 h-4 mr-2 text-cyan-400" />
        <span className="text-sm font-mono font-semibold tracking-wider">{formatTime(time)}</span>
      </div>
    </div>
  );
};

export default Clock;