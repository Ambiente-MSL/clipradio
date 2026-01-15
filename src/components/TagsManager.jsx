import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import apiClient from '@/lib/apiClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tag as TagIcon, Plus, Edit, Trash2, Loader } from 'lucide-react';

const predefinedColors = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'
];

const TagItem = ({ tag, onEdit, onDelete }) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, x: -20 }}
    className="flex items-center justify-between p-3 bg-slate-800 rounded-lg"
  >
    <div className="flex items-center gap-3">
      <div className="w-5 h-5 rounded-full" style={{ backgroundColor: tag.cor || '#6366f1' }} />
      <span className="font-medium text-slate-200">{tag.nome}</span>
    </div>
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={() => onEdit(tag)}>
        <Edit className="w-4 h-4 text-slate-400" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => onDelete(tag)}>
        <Trash2 className="w-4 h-4 text-red-500" />
      </Button>
    </div>
  </motion.div>
);

const TagForm = ({ tag, onSave, onCancel, loading }) => {
  const [name, setName] = useState(tag ? tag.nome : '');
  const [color, setColor] = useState(tag ? tag.cor : predefinedColors[5]);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ ...tag, nome: name, cor: color });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="tag-name" className="text-slate-300">Nome da tag</Label>
        <Input id="tag-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Notícia Urgente" className="mt-1" />
      </div>
      <div>
        <Label className="text-slate-300">Cor</Label>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start text-left font-normal mt-1"
          onClick={() => setIsPaletteOpen((prev) => !prev)}
          aria-expanded={isPaletteOpen}
          aria-controls="tag-color-palette"
        >
          <div className="w-5 h-5 rounded-full mr-2" style={{ backgroundColor: color }} />
          <span className="text-slate-200">{color}</span>
        </Button>
        {isPaletteOpen && (
          <div
            id="tag-color-palette"
            className="mt-2 rounded-md border border-slate-700 bg-slate-800 p-2"
          >
            <div className="grid grid-cols-6 gap-1">
              {predefinedColors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setColor(c);
                    setIsPaletteOpen(false);
                  }}
                  className="w-8 h-8 rounded-full transition-transform hover:scale-110"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      <DialogFooter className="pt-4">
        <DialogClose asChild>
          <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        </DialogClose>
        <Button type="submit" disabled={loading} >
          {loading ? <><Loader className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : 'Salvar'}
        </Button>
      </DialogFooter>
    </form>
  );
};

const TagsManager = ({ onTagsUpdated }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState(null);

  const fetchTags = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await apiClient.getTags();
      setTags(data || []);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro ao buscar tags', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleSaveTag = async (tagData) => {
    if (!tagData.nome.trim()) {
      toast({ variant: 'destructive', title: 'Erro', description: 'O nome da tag não pode ser vazio.' });
      return;
    }
    setIsSubmitting(true);
    try {
      if (tagData.id) {
        await apiClient.updateTag(tagData.id, { nome: tagData.nome, cor: tagData.cor });
      } else {
        await apiClient.createTag({ nome: tagData.nome, cor: tagData.cor });
      }
      toast({ title: `Tag ${tagData.id ? 'atualizada' : 'criada'} com sucesso!`, className: 'bg-green-600 text-white' });
      await fetchTags();
      if (onTagsUpdated) onTagsUpdated();
      setIsDialogOpen(false);
      setEditingTag(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro ao salvar tag', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTag = async (tag) => {
    if (!window.confirm(`Tem certeza que deseja excluir a tag "${tag.nome}"?`)) return;
    try {
      await apiClient.deleteTag(tag.id);
      toast({ title: 'Tag excluída com sucesso!', className: 'bg-green-600 text-white' });
      await fetchTags();
      if (onTagsUpdated) onTagsUpdated();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir tag', description: error.message });
    }
  };

  const handleOpenDialog = (tag = null) => {
    setEditingTag(tag);
    setIsDialogOpen(true);
  };

  return (
    <div className="p-4">
      <div className="flex justify-end mb-4">
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-2" /> Nova tag
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700 text-white">
            <DialogHeader>
              <DialogTitle className="gradient-text">{editingTag ? 'Editar Tag' : 'Criar nova tag'}</DialogTitle>
            </DialogHeader>
            <TagForm
              tag={editingTag}
              onSave={handleSaveTag}
              onCancel={() => { setIsDialogOpen(false); setEditingTag(null); }}
              loading={isSubmitting}
            />
          </DialogContent>
        </Dialog>
      </div>
      {loading ? (
        <div className="flex justify-center items-center h-48">
          <Loader className="w-8 h-8 animate-spin text-cyan-400" />
        </div>
      ) : (
        <div className="space-y-3 mt-4 max-h-[50vh] overflow-y-auto pr-2">
          {tags.length > 0 ? (
            tags.map((tag) => (
              <TagItem key={tag.id} tag={tag} onEdit={handleOpenDialog} onDelete={handleDeleteTag} />
            ))
          ) : (
            <div className="text-center py-12 text-slate-500">
              <TagIcon className="w-12 h-12 mx-auto mb-4" />
              <p className="font-semibold">Nenhuma tag encontrada.</p>
              <p className="text-sm">Clique em "Nova tag" para começar a organizar.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TagsManager;

