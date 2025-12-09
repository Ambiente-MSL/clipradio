import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Tag, Loader } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/customSupabaseClient";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useToast } from "@/components/ui/use-toast";

export default function InputPalavrasChave({ selectedTags, onSelectedTagsChange, availableTags, onAvailableTagsChange }) {
  const [input, setInput] = useState("");
  const [filteredTags, setFilteredTags] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (input) {
      const lowercasedInput = input.toLowerCase();
      const selectedTagNames = selectedTags.map(t => t.name.toLowerCase());
      setFilteredTags(
        availableTags.filter(
          (tag) =>
            tag.name.toLowerCase().includes(lowercasedInput) &&
            !selectedTagNames.includes(tag.name.toLowerCase())
        )
      );
    } else {
      setFilteredTags([]);
    }
  }, [input, availableTags, selectedTags]);

  const handleClickOutside = useCallback((event) => {
    if (containerRef.current && !containerRef.current.contains(event.target)) {
      setShowDropdown(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [handleClickOutside]);

  const addTag = (tag) => {
    if (!selectedTags.some(t => t.id === tag.id)) {
      onSelectedTagsChange([...selectedTags, tag]);
    }
    setInput("");
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const removeTag = (tagToRemove) => {
    onSelectedTagsChange(selectedTags.filter((tag) => tag.id !== tagToRemove.id));
  };

  const createAndAddTag = async (tagName) => {
    const trimmedName = tagName.trim();
    if (!trimmedName || isLoading) return;

    const existingTag = availableTags.find(t => t.name.toLowerCase() === trimmedName.toLowerCase());
    if (existingTag) {
      addTag(existingTag);
      return;
    }

    setIsLoading(true);
    try {
      const { data: newTag, error } = await supabase
        .from('tags')
        .insert({ name: trimmedName, color: '#84cc16', user_id: user.id })
        .select()
        .single();

      if (error) throw error;

      onAvailableTagsChange([...availableTags, newTag]);
      addTag(newTag);
      toast({ title: "Tag criada!", description: `A tag "${trimmedName}" foi adicionada.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Erro ao criar tag", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      createAndAddTag(input);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className="flex flex-wrap gap-2 border border-input bg-background rounded-md p-2 min-h-[44px] cursor-text items-center"
        onClick={() => {
          setShowDropdown(true);
          inputRef.current?.focus();
        }}
      >
        <AnimatePresence>
          {selectedTags.map((tag) => (
            <motion.div
              key={tag.id}
              layout
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="flex items-center text-white px-2.5 py-1 rounded-md text-sm"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag);
                }}
                className="ml-1.5 font-bold text-white/70 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowDropdown(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowDropdown(true)}
          className="flex-grow bg-transparent outline-none text-sm placeholder:text-muted-foreground p-1"
          placeholder={selectedTags.length > 0 ? "Adicionar mais..." : "Adicionar palavras-chave..."}
        />
        {isLoading && <Loader className="animate-spin text-muted-foreground" size={16} />}
      </div>

      <AnimatePresence>
        {showDropdown && (input.length > 0 || filteredTags.length > 0) && (
          <motion.ul
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-10 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto"
          >
            {filteredTags.map((tag) => (
              <li
                key={tag.id}
                className="px-3 py-2 hover:bg-accent cursor-pointer text-sm flex items-center gap-2"
                onClick={() => addTag(tag)}
              >
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </li>
            ))}
            {input.trim() && !availableTags.some(t => t.name.toLowerCase() === input.trim().toLowerCase()) && (
              <li
                className="px-3 py-2 hover:bg-accent cursor-pointer text-sm text-green-400"
                onClick={() => createAndAddTag(input)}
              >
                Criar nova tag: "{input.trim()}"
              </li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}