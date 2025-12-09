
    import React from 'react';
    import { useNavigate } from 'react-router-dom';
    import { motion } from 'framer-motion';
    import { cn } from '@/lib/utils';
    import { MapPin, Radio, Star, Mic, CalendarCheck, PowerOff } from 'lucide-react';
    
    const RadioStatusIcon = ({ radio }) => {
        if (!radio.ativo) {
            return (
                <div title="Rádio Inativa" className="p-1 rounded-full bg-slate-600/50 text-slate-400">
                    <PowerOff className="w-4 h-4" />
                </div>
            );
        }
        
        if (radio.estaGravando) {
            return (
                <div title="Gravando" className="p-1 rounded-full bg-red-500/30 text-red-400 animate-pulse">
                    <Mic className="w-4 h-4" />
                </div>
            );
        }
    
        if (radio.temAgendamentoAtivo) {
            return (
                <div title="Agendada" className="p-1 rounded-full bg-blue-500/30 text-blue-400">
                    <CalendarCheck className="w-4 h-4" />
                </div>
            );
        }
    
        return (
            <div title="Rádio Ociosa" className="p-1 rounded-full bg-green-500/20 text-green-500">
                <Radio className="w-4 h-4" />
            </div>
        );
    };
    
    const RadioListItem = ({ radio, index, isPlaying, onToggleFavorite }) => {
      const navigate = useNavigate();
    
      const handleContainerClick = () => {
        navigate(`/gravacoes?radioId=${radio.id}`);
      };
    
      const handleToggleFavorite = (e) => {
        e.stopPropagation();
        onToggleFavorite(radio);
      };
    
      const logoUrl = radio.logo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(radio.nome)}&background=27272a&color=ffffff&bold=true`;
    
      return (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.05 }}
          onClick={handleContainerClick}
          className={cn(
            "radio-list-item flex items-center p-4 border-b border-border/50 last:border-b-0 rounded-lg",
            "hover:bg-muted/30 transition-colors duration-200 cursor-pointer",
            isPlaying && "bg-primary/10 ring-2 ring-primary/50",
            radio.estaGravando && "bg-red-900/20"
          )}
        >
          <img src={logoUrl} alt={`Logo ${radio.nome}`} className="w-16 h-16 rounded-lg object-contain bg-muted/50 flex-shrink-0" />
          
          <div className="flex-1 min-w-0 ml-4">
            <div className="flex items-center gap-3">
               <RadioStatusIcon radio={radio} />
               <h3 className="font-bold text-lg text-foreground truncate">{radio.nome}</h3>
            </div>
            
            <div className="flex items-center text-muted-foreground text-sm mt-1">
              <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
              <span className="truncate">{radio.cidade || 'N/A'} - {radio.estado || 'N/A'}</span>
            </div>
            <div className="flex items-center text-muted-foreground text-sm mt-1">
              <Radio className="w-4 h-4 mr-2 flex-shrink-0" />
              <span className="truncate">{radio.stream_url}</span>
            </div>
          </div>
          <button onClick={handleToggleFavorite} title={radio.favorita ? "Remover dos favoritos" : "Adicionar aos favoritos"} className="p-1 ml-4 flex-shrink-0">
            <Star className={cn("w-5 h-5 text-muted-foreground/50 transition-colors", radio.favorita && "text-yellow-400 fill-yellow-400/50")} />
          </button>
        </motion.div>
      );
    };
    
    export default RadioListItem;
  