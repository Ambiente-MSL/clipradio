import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { Building2, Users, UserPlus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import apiClient from '@/lib/apiClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

const emptyUserForm = {
  email: '',
  nome: '',
  password: '',
  cliente_id: '',
  is_admin: false,
  ativo: true,
};

const emptyClientForm = {
  nome: '',
  cidade: '',
  estado: '',
};

const Admin = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [radios, setRadios] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [userForm, setUserForm] = useState(emptyUserForm);
  const [clientForm, setClientForm] = useState(emptyClientForm);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingClientId, setEditingClientId] = useState(null);
  const [savingUser, setSavingUser] = useState(false);
  const [savingClient, setSavingClient] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user?.is_admin) {
      navigate('/dashboard', { replace: true });
      return;
    }
    fetchData();
  }, [loading, navigate, user]);

  const fetchData = async () => {
    if (!user?.is_admin) return;
    setIsLoading(true);
    try {
      const [usersData, clientsData, radiosData] = await Promise.all([
        apiClient.getAdminUsers(),
        apiClient.getAdminClients(),
        apiClient.getRadios(),
      ]);
      setUsers(usersData || []);
      setClients(clientsData || []);
      setRadios(radiosData || []);
    } catch (error) {
      toast({
        title: 'Falha ao carregar dados',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clientById = useMemo(() => {
    const map = new Map();
    clients.forEach((client) => {
      map.set(client.id, client);
    });
    return map;
  }, [clients]);

  const estadoOptions = useMemo(() => {
    const estadoSet = new Set();
    radios.forEach((radio) => {
      if (radio.estado) estadoSet.add(radio.estado.toUpperCase());
    });
    clients.forEach((client) => {
      if (client.estado) estadoSet.add(client.estado.toUpperCase());
    });
    return Array.from(estadoSet).sort();
  }, [radios, clients]);

  const cidadeOptions = useMemo(() => {
    const cidadeSet = new Set();
    radios.forEach((radio) => {
      if (radio.cidade) cidadeSet.add(radio.cidade);
    });
    clients.forEach((client) => {
      if (client.cidade) cidadeSet.add(client.cidade);
    });
    return Array.from(cidadeSet).sort((a, b) => a.localeCompare(b));
  }, [radios, clients]);

  const resetUserForm = () => {
    setEditingUserId(null);
    setUserForm(emptyUserForm);
  };

  const resetClientForm = () => {
    setEditingClientId(null);
    setClientForm(emptyClientForm);
  };

  const handleUserSubmit = async (event) => {
    event.preventDefault();
    if (!userForm.email.trim()) {
      toast({ title: 'Email obrigatorio', variant: 'destructive' });
      return;
    }
    if (!editingUserId && !userForm.password.trim()) {
      toast({ title: 'Senha obrigatoria', variant: 'destructive' });
      return;
    }

    const payload = {
      email: userForm.email.trim(),
      nome: userForm.nome.trim() || undefined,
      cliente_id: userForm.is_admin ? null : (userForm.cliente_id ? userForm.cliente_id : null),
      ativo: userForm.ativo,
      is_admin: userForm.is_admin,
    };
    if (userForm.password.trim()) {
      payload.password = userForm.password.trim();
    }

    setSavingUser(true);
    try {
      if (editingUserId) {
        await apiClient.updateAdminUser(editingUserId, payload);
        toast({ title: 'Usuário atualizado' });
      } else {
        await apiClient.createAdminUser(payload);
        toast({ title: 'Usuário criado' });
      }
      resetUserForm();
      fetchData();
    } catch (error) {
      toast({ title: 'Erro ao salvar usuário', description: error.message, variant: 'destructive' });
    } finally {
      setSavingUser(false);
    }
  };

  const handleClientSubmit = async (event) => {
    event.preventDefault();
    if (!clientForm.nome.trim()) {
      toast({ title: 'Nome do cliente obrigatorio', variant: 'destructive' });
      return;
    }

    const payload = {
      nome: clientForm.nome.trim(),
      cidade: clientForm.cidade ? clientForm.cidade : null,
      estado: clientForm.estado ? clientForm.estado : null,
    };

    setSavingClient(true);
    try {
      if (editingClientId) {
        await apiClient.updateAdminClient(editingClientId, payload);
        toast({ title: 'Cliente atualizado' });
      } else {
        await apiClient.createAdminClient(payload);
        toast({ title: 'Cliente criado' });
      }
      resetClientForm();
      fetchData();
    } catch (error) {
      toast({ title: 'Erro ao salvar cliente', description: error.message, variant: 'destructive' });
    } finally {
      setSavingClient(false);
    }
  };

  const handleEditUser = (target) => {
    setEditingUserId(target.id);
    setUserForm({
      email: target.email || '',
      nome: target.nome || '',
      password: '',
      cliente_id: target.is_admin ? '' : (target.cliente_id || ''),
      is_admin: Boolean(target.is_admin),
      ativo: target.ativo !== false,
    });
  };

  const handleEditClient = (target) => {
    setEditingClientId(target.id);
    setClientForm({
      nome: target.nome || '',
      cidade: target.cidade || '',
      estado: target.estado || '',
    });
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Excluir este usuário?')) return;
    try {
      await apiClient.deleteAdminUser(userId);
      toast({ title: 'Usuário excluído' });
      fetchData();
    } catch (error) {
      toast({ title: 'Erro ao excluir usuário', description: error.message, variant: 'destructive' });
    }
  };

  const handleDeleteClient = async (clientId) => {
    if (!window.confirm('Excluir este cliente?')) return;
    try {
      await apiClient.deleteAdminClient(clientId);
      toast({ title: 'Cliente excluído' });
      fetchData();
    } catch (error) {
      toast({ title: 'Erro ao excluir cliente', description: error.message, variant: 'destructive' });
    }
  };

  if (loading || isLoading) {
    return (
      <div className="px-6">
        <Helmet><title>Admin | Clipradio</title></Helmet>
        <div className="max-w-6xl mx-auto mt-10 bg-slate-900/60 border border-slate-800 rounded-xl p-8 text-slate-300">
          Carregando painel admin...
        </div>
      </div>
    );
  }

  return (
    <div className="px-6">
      <Helmet>
        <title>Admin | Clipradio</title>
      </Helmet>

      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400 uppercase tracking-[0.2em]">Admin</p>
            <h1 className="text-3xl md:text-4xl font-bold text-white mt-1">Painel administrativo</h1>
            <p className="text-slate-400 mt-1">Gerencie clientes e usuários do sistema.</p>
          </div>
          <Button variant="outline" onClick={fetchData} className="border-slate-700 text-slate-100 hover:border-cyan-400">
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>

        <section className="card p-6 border border-slate-800 bg-slate-900/70">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
              <Building2 className="w-5 h-5 text-cyan-300" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Clientes</h2>
              <p className="text-sm text-slate-400">Vincule clientes a cidades.</p>
            </div>
          </div>

          <form onSubmit={handleClientSubmit} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <div className="space-y-2">
              <Label htmlFor="cliente-nome">Nome</Label>
              <Input
                id="cliente-nome"
                name="nome"
                value={clientForm.nome}
                onChange={(event) => setClientForm((prev) => ({ ...prev, nome: event.target.value }))}
                placeholder="Nome do cliente"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cliente-estado">Estado</Label>
              <select
                id="cliente-estado"
                className="input"
                value={clientForm.estado}
                onChange={(event) => setClientForm((prev) => ({ ...prev, estado: event.target.value }))}
              >
                <option value="">Selecionar</option>
                {estadoOptions.map((estado) => (
                  <option key={estado} value={estado}>{estado}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cliente-cidade">Cidade</Label>
              <select
                id="cliente-cidade"
                className="input"
                value={clientForm.cidade}
                onChange={(event) => setClientForm((prev) => ({ ...prev, cidade: event.target.value }))}
              >
                <option value="">Selecionar</option>
                {cidadeOptions.map((cidade) => (
                  <option key={cidade} value={cidade}>{cidade}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 md:col-span-2 xl:col-span-4">
              <Button type="submit" disabled={savingClient}>
                <UserPlus className="w-4 h-4 mr-2" />
                {editingClientId ? 'Salvar cliente' : 'Adicionar cliente'}
              </Button>
              {editingClientId && (
                <Button type="button" variant="ghost" onClick={resetClientForm}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>

          <div className="space-y-3">
            {clients.length === 0 ? (
              <div className="text-sm text-slate-400">Nenhum cliente cadastrado.</div>
            ) : (
              clients.map((client) => (
                <div key={client.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/50">
                  <div>
                    <p className="text-white font-medium">{client.nome}</p>
                    <p className="text-xs text-slate-400">
                      {(client.cidade || 'Cidade nao definida')}{client.estado ? ` - ${client.estado}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => handleEditClient(client)}>
                      <Pencil className="w-4 h-4 mr-1" />
                      Editar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteClient(client.id)}>
                      <Trash2 className="w-4 h-4 mr-1" />
                      Excluir
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="card p-6 border border-slate-800 bg-slate-900/70">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
              <Users className="w-5 h-5 text-cyan-300" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Usuários</h2>
              <p className="text-sm text-slate-400">Controle de acesso por cliente e permissao admin.</p>
            </div>
          </div>

          <form onSubmit={handleUserSubmit} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                name="email"
                value={userForm.email}
                onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="email@dominio.com"
                type="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-nome">Nome</Label>
              <Input
                id="user-nome"
                name="nome"
                value={userForm.nome}
                onChange={(event) => setUserForm((prev) => ({ ...prev, nome: event.target.value }))}
                placeholder="Nome do usuário"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-password">{editingUserId ? 'Nova senha (opcional)' : 'Senha'}</Label>
              <Input
                id="user-password"
                name="password"
                value={userForm.password}
                onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder={editingUserId ? 'Manter senha atual' : 'Senha inicial'}
                type="password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-cliente">Cliente</Label>
              <select
                id="user-cliente"
                className="input"
                value={userForm.cliente_id}
                onChange={(event) => setUserForm((prev) => ({ ...prev, cliente_id: event.target.value }))}
                disabled={userForm.is_admin}
              >
                <option value="">Sem cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.nome}</option>
                ))}
              </select>
              {userForm.is_admin && (
                <p className="text-xs text-slate-400">Admins nao podem ser vinculados a clientes.</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                checked={userForm.is_admin}
                onCheckedChange={(value) => setUserForm((prev) => ({
                  ...prev,
                  is_admin: Boolean(value),
                  cliente_id: value ? '' : prev.cliente_id,
                }))}
              />
              <span className="text-sm text-slate-300">Admin</span>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                checked={userForm.ativo}
                onCheckedChange={(value) => setUserForm((prev) => ({ ...prev, ativo: Boolean(value) }))}
              />
              <span className="text-sm text-slate-300">Usuário ativo</span>
            </div>
            <div className="flex items-center gap-2 md:col-span-2 xl:col-span-4">
              <Button type="submit" disabled={savingUser}>
                <UserPlus className="w-4 h-4 mr-2" />
                {editingUserId ? 'Salvar usuário' : 'Adicionar usuário'}
              </Button>
              {editingUserId && (
                <Button type="button" variant="ghost" onClick={resetUserForm}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>

          <div className="space-y-3">
            {users.length === 0 ? (
              <div className="text-sm text-slate-400">Nenhum usuário cadastrado.</div>
            ) : (
              users.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/50">
                  <div>
                    <p className="text-white font-medium">{u.nome || u.email}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                    <p className="text-xs text-slate-500">
                      {u.is_admin
                        ? 'Admin com acesso total'
                        : (u.cliente_id && clientById.get(u.cliente_id)
                          ? `Cliente: ${clientById.get(u.cliente_id).nome}`
                          : 'Sem cliente')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full border ${u.is_admin ? 'border-cyan-400 text-cyan-300' : 'border-slate-600 text-slate-300'}`}>
                      {u.is_admin ? 'Admin' : 'Usuário'}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full border ${u.ativo ? 'border-emerald-400 text-emerald-300' : 'border-red-400 text-red-300'}`}>
                      {u.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => handleEditUser(u)}>
                      <Pencil className="w-4 h-4 mr-1" />
                      Editar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteUser(u.id)}>
                      <Trash2 className="w-4 h-4 mr-1" />
                      Excluir
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Admin;
