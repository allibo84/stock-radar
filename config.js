// ⚠️ CONFIGURATION SUPABASE
const SUPABASE_URL = 'https://hbywyijhlhhgzlrvygob.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhieXd5aWpobGhoZ3pscnZ5Z29iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NDAzMjIsImV4cCI6MjA4NjExNjMyMn0.WROtVFsh5z8WoBPmctOLx2POeoFS1Hp8pin99DXk_-E';

// On utilise "sb" au lieu de "supabase" pour éviter le conflit
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);