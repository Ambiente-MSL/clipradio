
import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut, User, LayoutDashboard, Radio, Calendar, FileText, Mic, Tag } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';

const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Rádios', path: '/cadastro-radios', icon: Radio },
  { name: 'Agendamentos', path: '/agendamentos', icon: Calendar },
  { name: 'Gravações', path: '/gravacoes', icon: FileText },
  { name: 'Gravar Manual', path: '/gravador-manual', icon: Mic },
  { name: 'Tags', path: '/tags', icon: Tag },
];

const Navbar = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  if (!user) {
    return null;
  }

  const getNavLinkClass = (path) => {
    const baseClass = 'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all duration-300';
    const activeClass = 'bg-cyan-500/10 text-cyan-400';
    const inactiveClass = 'text-slate-400 hover:text-white hover:bg-slate-700/50';

    return location.pathname === path ? `${baseClass} ${activeClass}` : `${baseClass} ${inactiveClass}`;
  };

  return (
    <motion.header
      initial={{ y: -120 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      className="fixed top-0 left-0 right-0 z-40 bg-slate-900/50 backdrop-blur-lg border-b border-slate-800"
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <Logo />
            <h1 className="text-xl font-bold text-white tracking-wider">
              IA <span className="font-light text-cyan-400">RECORDER</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center justify-between h-12">
          <nav className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-hide">
            {navItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                className={getNavLinkClass(item.path)}
              >
                <item.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{item.name}</span>
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <NavLink to="/gravacoes" className={getNavLinkClass('/gravacoes')}>
              <FileText className="w-5 h-5" />
            </NavLink>
            <NavLink to="/profile" className={getNavLinkClass('/profile')}>
              <User className="w-5 h-5" />
            </NavLink>
            <Button variant="ghost" size="icon" onClick={handleSignOut} className="text-slate-400 hover:text-white transition-colors">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </motion.header>
  );
};

export default Navbar;
