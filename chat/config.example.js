// config.example.js — Chat interface API key template
//
// SETUP:
//   1. Copy this file to config.js (same directory)
//   2. Fill in all four values
//   3. config.js is gitignored — never commit it
//
// Where to find each key:
//   ANTHROPIC_API_KEY  → console.anthropic.com → API Keys
//   OPENAI_API_KEY     → platform.openai.com → API Keys
//   SUPABASE_URL       → Supabase dashboard → Settings → API → Project URL
//   SUPABASE_ANON_KEY  → Supabase dashboard → Settings → API → anon public

const CONFIG = {
  ANTHROPIC_API_KEY: 'sk-ant-api03-...',
  OPENAI_API_KEY:    'sk-...',
  SUPABASE_URL:      'https://[project-id].supabase.co',
  SUPABASE_ANON_KEY: 'eyJ...',
};
