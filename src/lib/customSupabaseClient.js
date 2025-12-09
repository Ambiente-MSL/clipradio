import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ssdfevqkhjcbeupcvowz.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzZGZldnFraGpjYmV1cGN2b3d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1NDYyNTksImV4cCI6MjA2OTEyMjI1OX0.vzd8_zXXShnAOfAt-crjbQy-uPAJZ44v86e3cHN3EYg';

// Verificar se as credenciais estão definidas
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Erro: Credenciais do Supabase não configuradas!');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
});

// Teste de conexão básico (opcional, apenas para debug)
if (typeof window !== 'undefined') {
  console.log('✅ Cliente Supabase inicializado:', supabaseUrl);
}