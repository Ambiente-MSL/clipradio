import React from 'react';
import { motion } from 'framer-motion';
import { Star, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const FavoriteRadioCard = ({ radio, index, onRecord, onToggleFavorite }) => {
  const handleRecordClick = (e) => {
    e.stopPropagation();
    onRecord(radio);
  };
  
  const handleToggleFavoriteClick = (e) => {
    e.stopPropagation();
    onToggleFavorite(radio);
  };

  const logoUrl = radio.logo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(radio.nome)}&background=1e293b&color=ffffff&bold=true`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="relative group flex flex-col"
    >
      <div className="relative aspect-square w-full bg-card rounded-lg overflow-hidden border border-border">
        <img src={logoUrl} alt={`Logo ${radio.nome}`} className="w-full h-full object-contain" />
        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 rounded-lg transition-opacity duration-300 flex flex-col items-center justify-center p-2 text-center">
          <div className="flex items-center space-x-2">
            <Button 
                variant="outline" 
                size="icon" 
                className="bg-transparent border-yellow-400 text-yellow-400 hover:bg-yellow-400/20 hover:text-yellow-300 w-9 h-9"
                onClick={handleToggleFavoriteClick}
                title="Remover dos Favoritos"
            >
                <Star className="w-4 h-4" fill="currentColor"/>
            </Button>
            <Button 
                variant="outline" 
                size="icon" 
                className="bg-transparent border-cyan-400 text-cyan-400 hover:bg-cyan-400/20 hover:text-cyan-300 w-9 h-9"
                onClick={handleRecordClick}
                title="Gravar Manualmente"
            >
                <Mic className="w-4 h-4"/>
            </Button>
          </div>
        </div>
      </div>
      <div className="mt-2 text-center">
         <p className="font-semibold text-white truncate text-sm">{radio.nome}</p>
         <div className="flex items-center justify-center text-xs text-muted-foreground gap-2">
            <span>{radio.cidade}</span>
            <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                radio.ativo ? "bg-green-500" : "bg-red-500"
            )} title={radio.ativo ? "Ativa" : "Inativa"}></div>
         </div>
      </div>
    </motion.div>
  );
};

export default FavoriteRadioCard;