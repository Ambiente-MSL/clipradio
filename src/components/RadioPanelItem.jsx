
    import React, { useState, useEffect } from 'react';
    import { useNavigate } from 'react-router-dom';
    import { motion } from 'framer-motion';
    import { cn } from '@/lib/utils';
    import { Clock, Calendar, Play, Mic, Pencil, MapPin, Volume2, Volume1, VolumeX, StopCircle, CalendarCheck, Loader, Star, ServerCrash, PowerOff, Radio } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
    import { Slider } from '@/components/ui/slider';
    
    const ActionButton = ({ icon: Icon, colorClass, onClick, title, fillClass }) => (
      <button
        onClick={onClick}
        title={title}
        className={cn(
          "p-2 rounded-lg transition-all duration-200 flex items-center justify-center",
          colorClass,
          "hover:scale-110 hover:shadow-lg"
        )}
      >
        <Icon className={cn("w-4 h-4", fillClass)} />
      </button>
    );
    
    const RadioClock = () => {
      const [now, setNow] = useState(new Date());
    
      useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
      }, []);
    
      return (
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mt-2">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-primary" />
            <span className="font-mono">{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3 text-primary" />
            <span>{now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
          </div>
        </div>
      );
    };
    
    const RadioStatusIcon = ({ radio }) => {
        if (!radio.ativo) {
            return (
                <div title="Rádio Inativa" className="p-1 rounded-full bg-slate-600/50 text-slate-400">
                    <PowerOff className="w-3 h-3" />
                </div>
            );
        }
        
        if (radio.estaGravando) {
            return (
                <div title="Gravando" className="p-1 rounded-full bg-red-500/30 text-red-400 animate-pulse">
                    <Mic className="w-3 h-3" />
                </div>
            );
        }
    
        if (radio.temAgendamentoAtivo) {
            return (
                <div title="Agendada" className="p-1 rounded-full bg-blue-500/30 text-blue-400">
                    <CalendarCheck className="w-3 h-3" />
                </div>
            );
        }
    
        return (
            <div title="Rádio Ociosa" className="p-1 rounded-full bg-green-500/20 text-green-500">
                <Radio className="w-3 h-3" />
            </div>
        );
    };
    
    
    const RadioPanelItem = ({ radio, index, isPlaying, onPlayPause, onRecord, volume, onVolumeChange, onToggleFavorite }) => {
      const navigate = useNavigate();
    
      const handleEdit = (e) => {
        e.stopPropagation();
        navigate(`/agendamentos?radioId=${radio.id}`);
      };
      
      const handleRecordClick = (e) => {
        e.stopPropagation();
        onRecord(radio);
      };
    
      const handlePlayPauseClick = (e) => {
        e.stopPropagation();
        if (onPlayPause) {
          onPlayPause(radio);
        }
      };
    
      const handleToggleFavorite = (e) => {
        e.stopPropagation();
        onToggleFavorite(radio);
      };
    
      const VolumeIcon = () => {
        if (volume === 0) return <VolumeX className="w-4 h-4" />;
        if (volume < 0.5) return <Volume1 className="w-4 h-4" />;
        return <Volume2 className="w-4 h-4" />;
      };
      
      const logoUrl = radio.logo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(radio.nome)}&background=1e293b&color=ffffff&bold=true`;
    
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.05 }}
          className="w-full"
        >
          <div className={cn(
            "radio-panel-card radio-panel-card--shine rounded-xl p-3 border border-border transition-all duration-300 h-full flex flex-col justify-between",
            isPlaying && "border-primary shadow-primary/20",
            radio.temAgendamentoAtivo && !radio.estaGravando && "border-blue-500/60",
            radio.estaGravando && "border-red-500/80 shadow-red-500/20"
          )}>
            <div className="z-10">
              <div className="flex justify-between items-start gap-2">
                <img src={logoUrl} alt={`Logo ${radio.nome}`} className="w-12 h-12 rounded-md object-contain bg-muted/50 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <RadioStatusIcon radio={radio} />
                    <h3 className="font-bold text-foreground truncate text-sm flex-1">{radio.nome}</h3>
                  </div>
                  <div className="flex items-center text-muted-foreground text-xs mt-0.5 pl-1">
                    <MapPin className="w-3 h-3 mr-1" />
                    <span className="truncate">{radio.cidade || 'N/A'}</span>
                  </div>
                  <RadioClock />
                </div>
                <div className={cn(
                  "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                  radio.ativo ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                )}>
                  {radio.ativo ? 'Ativa' : 'Inativa'}
                </div>
              </div>
            </div>
    
            <div className="mt-3 z-10">
              <div className="grid grid-cols-5 gap-1.5 mb-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      title="Volume"
                      className="p-2 rounded-lg transition-all duration-200 flex items-center justify-center bg-secondary/50 text-muted-foreground hover:bg-secondary hover:scale-110 hover:shadow-lg"
                    >
                      <VolumeIcon />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-40 bg-popover border-border p-2">
                    <Slider
                      defaultValue={[volume * 100]}
                      max={100}
                      step={1}
                      onValueChange={(value) => onVolumeChange(radio.id, value[0] / 100)}
                    />
                  </PopoverContent>
                </Popover>
                <ActionButton 
                  icon={isPlaying ? StopCircle : Play} 
                  colorClass={isPlaying ? "bg-destructive/20 text-destructive-foreground hover:bg-destructive/30" : "bg-primary/20 text-primary hover:bg-primary/30"}
                  onClick={handlePlayPauseClick}
                  title={isPlaying ? "Parar" : "Ouvir"}
                />
                <ActionButton 
                  icon={Mic} 
                  colorClass="bg-purple-500/20 text-purple-300 hover:bg-purple-500/30" 
                  onClick={handleRecordClick}
                  title="Gravar Manualmente"
                />
                 <ActionButton 
                  icon={Pencil} 
                  colorClass="bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30" 
                  onClick={handleEdit}
                  title="Ver Agendamentos"
                />
                <ActionButton
                  icon={Star}
                  colorClass="bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
                  fillClass={radio.favorita ? "fill-current" : ""}
                  onClick={handleToggleFavorite}
                  title={radio.favorita ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                />
              </div>
              <Button 
                onClick={() => navigate(`/gravacoes?radioId=${radio.id}`)}
                className="w-full bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-400/30 h-8 text-xs"
              >
                Ver Gravações
              </Button>
            </div>
          </div>
        </motion.div>
      );
    };
    
    export default RadioPanelItem;
  