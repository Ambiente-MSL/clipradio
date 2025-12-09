import React from 'react';
import { Helmet } from 'react-helmet';
import TagsManager from '@/components/TagsManager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tag } from 'lucide-react';

const TagsPage = () => {
  return (
    <>
      <Helmet>
        <title>Gerenciar Tags - Gestor de Rádios</title>
        <meta name="description" content="Crie, edite e exclua suas tags personalizadas para organizar as gravações." />
      </Helmet>
      <div className="container mx-auto p-4 md:p-6 lg:p-8">
        <Card className="max-w-4xl mx-auto bg-slate-900/80 border-slate-800 backdrop-blur-sm shadow-2xl shadow-black/20">
          <CardHeader className="border-b border-slate-800">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg text-white">
                <Tag className="w-6 h-6" />
              </div>
              <CardTitle className="text-2xl font-bold gradient-text">
                Gerenciador de Tags
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <TagsManager />
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default TagsPage;