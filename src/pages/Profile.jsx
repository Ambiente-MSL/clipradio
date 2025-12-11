import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const Profile = () => {
  const { user } = useAuth();

  const getInitials = () => {
    if (user?.nome) {
      return user.nome.substring(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.substring(0, 2).toUpperCase();
    }
    return 'U';
  };

  return (
    <>
      <Helmet>
        <title>Meu Perfil - IA Recorder</title>
        <meta name="description" content="Dados da sua conta." />
      </Helmet>
      <div className="p-4 md:p-6 max-w-4xl mx-auto text-white">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center mb-8"
        >
          <User className="w-8 h-8 mr-3 text-cyan-400" />
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Meu Perfil</h1>
            <p className="text-md text-slate-400">Informações da sua conta.</p>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
          <Card className="bg-slate-800/40 border-slate-700/60">
            <CardHeader>
              <div className="flex items-center gap-6">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={user?.avatar_url} alt="User avatar" />
                  <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-blue-600 text-white font-bold text-3xl">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle className="text-2xl">{user?.nome || 'Usuário'}</CardTitle>
                  <CardDescription className="text-slate-400">{user?.email}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-slate-300">Para alterar suas informações de conta, entre em contato com o administrador.</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default Profile;
