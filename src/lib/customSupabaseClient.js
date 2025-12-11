// Supabase client removido: este stub evita chamadas indevidas.
export const supabase = {
  from() {
    throw new Error('Supabase não está mais disponível neste projeto. Use apiClient.');
  },
  functions: {
    async invoke() {
      return { data: null, error: new Error('Supabase Functions não estão habilitadas. Use a API do backend.') };
    },
  },
  storage: {
    from() {
      return {
        async upload() {
          return { data: null, error: new Error('Storage do Supabase removido. Use backend/storage apropriado.') };
        },
        getPublicUrl() {
          return { publicUrl: null };
        },
      };
    },
  },
  channel() {
    return {
      on() { return this; },
      subscribe() { return { id: null }; },
    };
  },
  removeChannel() {},
};
