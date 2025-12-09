import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { UserPlus, Loader, ShieldCheck, LogIn } from 'lucide-react';

const Cadastro = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailConfirmationSent, setEmailConfirmationSent] = useState(false);
  
  const { signUp, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const { error } = await signUp(email, password, {
      emailRedirectTo: `${window.location.origin}/login`
    });

    if (!error) {
      setEmailConfirmationSent(true);
      toast({
          title: "Confirmação necessária!",
          description: "Enviamos um link de confirmação para o seu e-mail. Por favor, verifique sua caixa de entrada.",
          duration: 9000
      });
    }
    
    setIsSubmitting(false);
  };

  if (emailConfirmationSent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md card text-center"
        >
          <ShieldCheck className="w-16 h-16 text-green-400 mx-auto mb-6" />
          <h1 className="text-3xl font-bold gradient-text mb-4">Verifique seu E-mail</h1>
          <p className="text-slate-300 text-lg">
            Um link de confirmação foi enviado para <span className="font-bold text-cyan-400">{email}</span>.
          </p>
          <p className="text-slate-400 mt-2">
            Clique no link para ativar sua conta e depois faça o login.
          </p>
          <Link to="/login">
            <Button className="mt-8 btn btn-primary">
              Ir para Login
            </Button>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md card"
      >
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold gradient-text mb-2">
            Criar Nova Conta
          </h1>
          <p className="text-slate-400">
            Preencha os dados para começar a gravar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="seu@email.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="•••••••• (mínimo 6 caracteres)"
              required
            />
          </div>
          <Button type="submit" className="btn btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader className="animate-spin w-5 h-5" />
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" /> Criar Conta
              </>
            )}
          </Button>
        </form>
        
        <div className="mt-6 text-center">
          <p className="text-slate-400">
            Já tem uma conta?
            <Link to="/login">
              <button className="font-semibold text-cyan-400 hover:text-cyan-300 ml-2 focus:outline-none">
                Faça login
              </button>
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Cadastro;