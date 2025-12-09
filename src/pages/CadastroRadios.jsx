import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Radio, Globe, Plus, Edit, Trash2, Power, PowerOff, Loader, MapPin, UploadCloud, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const CadastroRadios = () => {
  const [radios, setRadios] = useState([]);
  const [formData, setFormData] = useState({
    nome: '',
    stream_url: '',
    cidade: '',
    estado: '',
    ativo: true,
    logo_url: '',
  });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const resetForm = useCallback(() => {
    setFormData({ nome: '', stream_url: '', cidade: '', estado: '', ativo: true, logo_url: '' });
    setLogoFile(null);
    setLogoPreview('');
    setEditingId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const fetchRadios = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.from('radios').select('*').eq('user_id', user.id).order('criado_em', { ascending: false });
    if (error) {
      toast({ title: "Erro ao buscar rádios", description: error.message, variant: "destructive" });
    } else {
      setRadios(data);
    }
    setLoading(false);
  }, [toast, user]);

  useEffect(() => {
    if(user) {
      fetchRadios();
    }
  }, [user, fetchRadios]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleUploadLogo = async (radioId) => {
    if (!logoFile) return formData.logo_url;
    setUploading(true);
    
    const fileExt = logoFile.name.split('.').pop();
    const fileName = `${radioId}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('radio-logos')
      .upload(filePath, logoFile, {
        cacheControl: '3600',
        upsert: true,
      });

    setUploading(false);
    if (uploadError) {
      toast({ title: "Erro no upload da logo", description: uploadError.message, variant: "destructive" });
      return null;
    }

    const { data: { publicUrl } } = supabase.storage.from('radio-logos').getPublicUrl(filePath);
    return publicUrl;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.nome || !formData.stream_url || !formData.cidade || !formData.estado) {
      toast({ title: "Erro", description: "Todos os campos são obrigatórios", variant: "destructive" });
      return;
    }

    if (!user) {
      toast({ title: "Erro de autenticação", description: "Você precisa estar logado.", variant: "destructive" });
      return;
    }

    let radioId = editingId;
    let finalLogoUrl = formData.logo_url;

    if (editingId) {
      // Update existing radio
      if (logoFile) {
        finalLogoUrl = await handleUploadLogo(editingId);
        if (!finalLogoUrl) return;
      }
      const { error } = await supabase.from('radios').update({ ...formData, logo_url: finalLogoUrl }).eq('id', editingId);
      if (error) {
        toast({ title: "Erro ao atualizar rádio", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Sucesso!", description: "Rádio atualizada com sucesso" });
        resetForm();
        fetchRadios();
      }
    } else {
      // Create new radio
      const { data, error } = await supabase.from('radios').insert({ ...formData, user_id: user.id, logo_url: '' }).select().single();
      if (error) {
        toast({ title: "Erro ao cadastrar rádio", description: error.message, variant: "destructive" });
        return;
      }
      radioId = data.id;
      if (logoFile) {
        finalLogoUrl = await handleUploadLogo(radioId);
        if (!finalLogoUrl) {
          // Cleanup if upload fails
          await supabase.from('radios').delete().eq('id', radioId);
          return;
        }
        const { error: updateError } = await supabase.from('radios').update({ logo_url: finalLogoUrl }).eq('id', radioId);
        if (updateError) {
          toast({ title: "Erro ao salvar logo", description: updateError.message, variant: "destructive" });
          return;
        }
      }
      toast({ title: "Sucesso!", description: "Rádio cadastrada com sucesso" });
      resetForm();
      fetchRadios();
    }
  };

  const handleEdit = (radio) => {
    setEditingId(radio.id);
    setFormData({
      nome: radio.nome,
      stream_url: radio.stream_url,
      cidade: radio.cidade || '',
      estado: radio.estado || '',
      ativo: radio.ativo,
      logo_url: radio.logo_url || '',
    });
    setLogoPreview(radio.logo_url || '');
    setLogoFile(null);
  };

  const handleDelete = async (id) => {
    const { error } = await supabase.from('radios').delete().eq('id', id);
    if (error) {
      toast({ title: "Erro ao remover rádio", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Rádio removida", description: "A rádio foi removida com sucesso" });
      fetchRadios();
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    const newStatus = !currentStatus;
    const { error } = await supabase.from('radios').update({ ativo: newStatus }).eq('id', id);
    if (error) {
      toast({ title: "Erro ao alterar status", description: error.message, variant: "destructive" });
    } else {
      const radio = radios.find(r => r.id === id);
      toast({ title: `Rádio ${newStatus ? 'ativada' : 'desativada'}`, description: `${radio.nome} está agora ${newStatus ? 'ativa' : 'inativa'}` });
      fetchRadios();
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold gradient-text mb-2">Gerenciador de Rádios</h1>
          <p className="text-slate-400 text-lg">Adicione, edite e organize suas estações de rádio.</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-1">
            <Card className="bg-slate-800/40 border-slate-700/60">
              <CardHeader>
                <CardTitle className="flex items-center text-white">
                  <Plus className="w-6 h-6 mr-3 text-cyan-400" />
                  {editingId ? 'Editar Rádio' : 'Nova Rádio'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div
                    className="relative w-full h-32 border-2 border-dashed border-slate-600 rounded-lg flex items-center justify-center cursor-pointer hover:border-cyan-500 transition-all"
                    onClick={() => fileInputRef.current.click()}
                  >
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                    {logoPreview ? (
                      <>
                        <img src={logoPreview} alt="Preview" className="w-full h-full object-contain rounded-lg p-1" />
                        <button type="button" onClick={(e) => { e.stopPropagation(); setLogoFile(null); setLogoPreview(formData.logo_url || ''); }} className="absolute top-1 right-1 bg-black/50 p-1 rounded-full text-white hover:bg-black/80"><X className="w-4 h-4" /></button>
                      </>
                    ) : (
                      <div className="text-center text-slate-400">
                        <UploadCloud className="mx-auto w-8 h-8" />
                        <p className="text-sm mt-1">Clique para subir a logo</p>
                      </div>
                    )}
                  </div>

                  <Input type="text" value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} placeholder="Nome da Rádio" required />
                  <Input type="url" value={formData.stream_url} onChange={(e) => setFormData({ ...formData, stream_url: e.target.value })} placeholder="URL do Streaming" required />
                  <div className="flex gap-4">
                    <Input type="text" value={formData.cidade} onChange={(e) => setFormData({ ...formData, cidade: e.target.value })} placeholder="Cidade" required />
                    <Input type="text" value={formData.estado} onChange={(e) => setFormData({ ...formData, estado: e.target.value })} placeholder="Estado (UF)" maxLength="2" required />
                  </div>
                  <select value={formData.ativo} onChange={(e) => setFormData({ ...formData, ativo: e.target.value === 'true' })} className="input w-full">
                    <option value={true}>Ativa</option>
                    <option value={false}>Inativa</option>
                  </select>
                  <div className="flex space-x-4 pt-2">
                    <Button type="submit" className="btn btn-primary flex-1" disabled={uploading}>
                      {uploading ? <Loader className="animate-spin w-5 h-5" /> : (editingId ? 'Atualizar' : 'Cadastrar')}
                    </Button>
                    {editingId && (<Button type="button" onClick={resetForm} variant="secondary" className="btn btn-secondary">Cancelar</Button>)}
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-2">
            <Card className="bg-slate-800/40 border-slate-700/60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center text-white"><Radio className="w-6 h-6 mr-3 text-cyan-400" />Rádios Cadastradas</CardTitle>
                  <span className="bg-slate-700 text-slate-300 px-3 py-1 rounded-full text-sm font-medium">{radios.length}</span>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center items-center h-48"><Loader className="w-8 h-8 animate-spin text-cyan-400" /></div>
                ) : radios.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-slate-700 rounded-lg">
                    <Radio className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400 text-lg">Nenhuma rádio cadastrada</p>
                    <p className="text-slate-500">Use o formulário ao lado para começar.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                    {radios.map((radio, index) => (
                      <motion.div key={radio.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700 hover:border-cyan-500/50 transition-all duration-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <img src={radio.logo_url || `https://ui-avatars.com/api/?name=${radio.nome}&background=random&color=fff`} alt={`Logo ${radio.nome}`} className="w-12 h-12 rounded-md object-contain bg-slate-700" />
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-white truncate">{radio.nome}</h3>
                              <div className="flex items-center text-slate-400 text-xs"><MapPin className="w-3 h-3 mr-1" /><span>{radio.cidade}, {radio.estado}</span></div>
                              <div className="flex items-center text-slate-400 text-xs mt-1"><Globe className="w-3 h-3 mr-1" /><span className="truncate">{radio.stream_url}</span></div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-1.5 ml-2">
                            <button onClick={() => toggleStatus(radio.id, radio.ativo)} className={`p-1.5 rounded-md transition-all duration-200 ${radio.ativo ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`} title={radio.ativo ? 'Desativar' : 'Ativar'}>{radio.ativo ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}</button>
                            <button onClick={() => handleEdit(radio)} className="p-1.5 rounded-md bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-all duration-200" title="Editar"><Edit className="w-4 h-4" /></button>
                            <button onClick={() => handleDelete(radio.id)} className="p-1.5 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all duration-200" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default CadastroRadios;