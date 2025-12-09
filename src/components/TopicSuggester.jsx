import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Lightbulb, Loader } from 'lucide-react';

const allSuggestions = {
    'marketing político': ['Discursos Políticos', 'Análise de Debates', 'Campanhas Eleitorais', 'Fake News e Política', 'Estratégia Digital para Candidatos'],
    'marketing digital com ia': ['Automação de Conteúdo', 'Chatbots e IA', 'Análise Preditiva de Clientes', 'Personalização com IA', 'O Futuro do SEO com IA'],
    'conteudos para redes sociais': ['Marketing de Influência', 'Criação de Reels', 'Estratégias para TikTok', 'Conteúdo Viral', 'Gestão de Comunidade Online'],
};

const TopicSuggester = ({ onSuggest, mainTopic }) => {
    const [loading, setLoading] = useState(false);

    const handleSuggest = () => {
        setLoading(true);
        
        setTimeout(() => {
            const suggestions = allSuggestions[mainTopic.toLowerCase()] || allSuggestions['conteudos para redes sociais'];
            
            const newTopics = suggestions.map(name => ({ id: `${Date.now()}-${name}`, name }));
            onSuggest(newTopics);
            setLoading(false);
        }, 1500);
    };

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Button 
                type="button" 
                variant="outline" 
                onClick={handleSuggest} 
                disabled={loading}
                className="w-full mt-2"
            >
                {loading ? (
                    <>
                        <Loader className="w-4 h-4 mr-2 animate-spin" />
                        Sugerindo...
                    </>
                ) : (
                    <>
                        <Lightbulb className="w-4 h-4 mr-2 text-yellow-400" />
                        Sugerir Tópicos com IA
                    </>
                )}
            </Button>
        </motion.div>
    );
};

export default TopicSuggester;