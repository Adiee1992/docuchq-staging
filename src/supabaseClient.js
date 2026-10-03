import { createClient } from '@supabase/supabase-js';

// Copy these unique keys from your Supabase Project Settings API page
const supabaseUrl = 'https://eyxwnvyloccnipspzgoe.supabase.co';
const supabaseAnonKey = 'sb_publishable_CEODX9vpVK4pb8ZigYV3Ag_vpcKbL1M';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);