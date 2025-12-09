import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ssdfevqkhjcbeupcvowz.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzZGZldnFraGpjYmV1cGN2b3d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1NDYyNTksImV4cCI6MjA2OTEyMjI1OX0.vzd8_zXXShnAOfAt-crjbQy-uPAJZ44v86e3cHN3EYg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);