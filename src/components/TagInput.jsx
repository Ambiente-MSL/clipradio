import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const TagInput = ({ tags, setTags, placeholder, className }) => {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      addTag(inputValue.trim());
    }
  };

  const addTag = (tagName) => {
    if (tagName && !tags.some(tag => tag.name === tagName)) {
      setTags([...tags, { id: Date.now().toString(), name: tagName }]);
      setInputValue('');
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag.id !== tagToRemove.id));
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex gap-2">
        <Input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Adicione uma tag...'}
          className="flex-grow"
        />
        <Button
          type="button"
          onClick={() => addTag(inputValue.trim())}
          disabled={!inputValue.trim()}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 min-h-[40px] p-2 rounded-md border border-input">
        <AnimatePresence>
          {tags.map(tag => (
            <motion.div
              key={tag.id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="flex items-center gap-1 bg-cyan-500/20 text-cyan-300 text-sm font-medium px-2 py-1 rounded-full"
            >
              <span>{tag.name}</span>
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="rounded-full hover:bg-red-500/20 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};