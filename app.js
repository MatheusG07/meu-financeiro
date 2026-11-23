/* Meu Financeiro v1.7 — autenticação e armazenamento Supabase */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const SITE_URL = 'https://matheusg07.github.io/meu-financeiro/';
  let client = null;
  let appStarted = false;
  let authBusy = false;

  function message(error) { return error?.message || String(error); }
  function notice(text) { const el = $('#authNotice'); if (el) el.textContent = text; }
  function configured() {
    if (!window.supabase?.createClient) throw new Error('Biblioteca Supabase não carregada. Confira a internet.');
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;
    if (typeof url !== 'string' || !/^https:\/\/[^/]+\.supabase\.co\/?$/.test(url.trim())) throw new Error('URL do Supabase inválida em config.js.');
    if (typeof key !== 'string' || key.length < 20 || /COLE_AQUI|SUA_CHAVE|YOUR_/i.test(key)) throw new Error('Configure a chave pública (anon/publishable) em config.js.');
  }
  function credentials() {
    const email = $('#authEmail')?.value.trim() || '';
    const password = $('#authPassword')?.value || '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
    if (password.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres.');
    return { email, password };
  }
  function check(result) {
    if (result.error) throw result.error;
    return result.data;
  }
  async function userId() {
    if (!client) throw new Error('Supabase ainda não inicializado.');
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) throw new Error('Sessão expirada. Faça login novamente.');
    return data.user.id;
  }
  function signedOut() {
    $('#appShell')?.classList.add('hidden');
    $('#authScreen')?.classList.remove('hidden');
  }
  async function signedIn() {
    $('#authScreen')?.classList.add('hidden');
    $('#appShell')?.classList.remove('hidden');
    notice('');
    try {
      if (!appStarted) {
        if (typeof window.startFinanceApp !== 'function') throw new Error('app.js não foi carregado.');
        appStarted = true;
        await window.startFinanceApp();
      } else if (typeof window.financeReload === 'function') {
        await window.financeReload();
      }
    } catch (error) {
      const el = $('#notice');
      if (el) el.textContent = 'Erro ao carregar lançamentos: ' + message(error);
      console.error('Erro ao iniciar aplicativo:', error);
    }
  }
  async function runAuth(task) {
    if (authBusy) return;
    authBusy = true;
    const buttons = ['#loginBtn', '#signupBtn'].map($).filter(Boolean);
    buttons.forEach(button => { button.disabled = true; });
    try {
      if (!client) throw new Error('Supabase não configurado. Verifique config.js.');
      await task();
    } catch (error) {
      console.error('Falha de autenticação:', error);
      notice(message(error));
    } finally {
      authBusy = false;
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  window.cloudStore = {
    async list() {
      const uid = await userId();
      const all = [];
      for (let offset = 0; ; offset += 500) {
        const batch = check(await client.from('finance_entries')
          .select('payload').eq('user_id', uid)
          .order('created_at', { ascending: true }).order('id', { ascending: true })
          .range(offset, offset + 499));
        all.push(...batch.map(row => row.payload));
        if (batch.length < 500) break;
      }
      return all;
    },
    async apply(ops) {
      const uid = await userId();
      for (const op of ops) {
        if (op.kind === 'clear') {
          check(await client.from('finance_entries').delete().eq('user_id', uid));
        } else if (op.kind === 'delete') {
          check(await client.from('finance_entries').delete().eq('user_id', uid).eq('id', op.id));
        } else if (op.kind === 'add' || op.kind === 'put') {
          const row = { id: op.item.id, user_id: uid, payload: op.item, updated_at: new Date().toISOString() };
          if (op.kind === 'add') check(await client.from('finance_entries').insert(row));
          else check(await client.from('finance_entries').upsert(row, { onConflict: 'user_id,id' }));
        } else {
          throw new Error('Operação de armazenamento desconhecida: ' + op.kind);
        }
      }
    }
  };

  window.reloadFinanceApp = async () => {
    if (typeof window.financeReload === 'function') await window.financeReload();
  };

  async function initialize() {
    try {
      configured();
      client = window.supabase.createClient(window.SUPABASE_URL.trim(), window.SUPABASE_ANON_KEY.trim(), {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (data.session) await signedIn();
      else signedOut();
      client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') signedOut();
        // O login explícito chama signedIn após a resposta; evita inicialização dupla.
        if (event === 'SIGNED_IN' && appStarted) {
          setTimeout(() => window.reloadFinanceApp().catch(console.error), 0);
        }
      });
    } catch (error) {
      signedOut();
      console.error('Inicialização Supabase:', error);
      notice(message(error));
    }
  }

  $('#authForm')?.addEventListener('submit', event => {
    event.preventDefault();
    runAuth(async () => {
      const { email, password } = credentials();
      notice('Entrando...');
      const data = check(await client.auth.signInWithPassword({ email, password }));
      if (!data.session) throw new Error('Login não concluído. Confirme seu e-mail.');
      await signedIn();
    });
  });

  $('#signupBtn')?.addEventListener('click', event => {
    event.preventDefault();
    runAuth(async () => {
      const { email, password } = credentials();
      notice('Criando conta...');
      const data = check(await client.auth.signUp({
        email, password,
        options: { emailRedirectTo: SITE_URL }
      }));
      if (data.session) await signedIn();
      else notice('Cadastro solicitado. Confira seu e-mail e confirme a conta antes de entrar.');
    });
  });

  $('#logoutBtn')?.addEventListener('click', () => {
    runAuth(async () => {
      check(await client.auth.signOut());
      signedOut();
      notice('Você saiu da conta.');
    });
  });

  initialize();
})();
