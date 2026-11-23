'use strict';
/* Meu Financeiro v2: autenticação e sincronização com controle de versão. */
(() => {
  let client, user=null, revision=0, db=null, syncTimer=null, syncing=false, dirty=false, blocked=false, changes=0;
  const $=id=>document.getElementById(id);
  const message=text=>{const el=$('authMessage');if(el)el.textContent=text;else console.warn(text)};
  const status=text=>{const el=$('syncInfo');if(el)el.textContent=text;console.info('[Sincronização]',text)};
  function config(){
    const cfg=window.FINANCE_CONFIG||{};
    if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(cfg.supabaseUrl||''))throw Error('URL do Supabase inválida em config.js.');
    if(!cfg.supabaseAnonKey||cfg.supabaseAnonKey.includes('COLE_')||cfg.supabaseAnonKey.includes('SUA_'))throw Error('Preencha a chave pública em config.js.');
    if(!window.supabase?.createClient)throw Error('Biblioteca Supabase não carregou. Verifique a conexão com a internet.');
    return window.supabase.createClient(cfg.supabaseUrl.replace(/\/$/,''),cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  }
  const getAll=store=>new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const putSnapshot=(payload)=>new Promise((resolve,reject)=>{
    const tx=db.transaction(['entries','goals','categories'],'readwrite');
    for(const storeName of ['entries','goals','categories']){
      const store=tx.objectStore(storeName);store.clear();
      for(const record of (Array.isArray(payload?.[storeName])?payload[storeName]:[]))store.put(record);
    }
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
  async function pullIntoDB(database){
    db=database;
    const {data,error}=await client.from('finance_v2_data').select('payload,revision').eq('user_id',user.id).maybeSingle();
    if(error)throw Error('Não foi possível consultar seus dados: '+error.message);
    if(data){revision=data.revision;window.FinanceCloud.applyingRemote=true;try{await putSnapshot(data.payload)}finally{window.FinanceCloud.applyingRemote=false}}
    else{
      const {error:insertError}=await client.from('finance_v2_data').insert({user_id:user.id,payload:{entries:[],goals:[],categories:[]},revision:0});
      if(insertError)throw Error('Não foi possível iniciar o armazenamento: '+insertError.message);
      revision=0;
      window.FinanceCloud.applyingRemote=true;try{await putSnapshot({})}finally{window.FinanceCloud.applyingRemote=false}
    }
    status('Dados online carregados. Revisão '+revision+'.');
  }
  async function snapshot(){const [entries,goals,categories]=await Promise.all(['entries','goals','categories'].map(getAll));return {entries,goals,categories}}
  async function syncNow(){
    if(!user||!db||blocked||syncing)return;
    syncing=true;clearTimeout(syncTimer);
    try{
      const atStart=changes;
      const payload=await snapshot();
      const {data,error}=await client.rpc('finance_v2_save',{expected_revision:revision,new_payload:payload});
      if(error)throw Error(error.message);
      if(data===null){blocked=true;status('Conflito: houve alterações em outro dispositivo. Faça backup local antes de atualizar. Nenhum dado remoto foi sobrescrito.');return}
      revision=data;dirty=changes!==atStart;status('Sincronizado com segurança. Revisão '+revision+'.');
    }catch(err){dirty=true;status('Falha de sincronização: '+err.message+' — seus dados continuam neste navegador.');}
    finally{syncing=false;if(dirty&&!blocked)status('Há alterações locais pendentes. Use “Sincronizar agora” para tentar novamente.');}
  }
  function scheduleSync(){changes++;dirty=true;clearTimeout(syncTimer);syncTimer=setTimeout(()=>{if(syncing){scheduleSync();return}syncNow()},500)}
  async function logout(){
    if(dirty){await syncNow();if(dirty&&!confirm('Há alterações não sincronizadas. Sair mesmo assim?'))return}
    await client.auth.signOut();location.reload();
  }
  window.FinanceCloud={get user(){return user},applyingRemote:false,pullIntoDB,scheduleSync,syncNow,logout};
  document.addEventListener('DOMContentLoaded',async()=>{
    const form=$('authForm');
    try{client=config()}catch(err){message(err.message);return}
    async function launch(session){
      if(!session?.user)return;
      user=session.user;
      $('authScreen').classList.add('hidden');$('appLayout').classList.remove('hidden');
      try{await window.FinanceAppStart()}catch(err){status('Erro ao abrir o aplicativo: '+err.message);console.error(err)}
    }
    const {data:{session},error}=await client.auth.getSession();
    if(error)message(error.message);
    if(session){await launch(session);return}
    form.addEventListener('submit',async e=>{
      e.preventDefault();message('Entrando...');
      const email=form.elements.email.value.trim(),password=form.elements.password.value;
      try{const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;message('');await launch(data.session)}catch(err){message(err.message)}
    });
    $('signUpBtn').addEventListener('click',async()=>{
      const email=form.elements.email.value.trim(),password=form.elements.password.value;
      if(!email||password.length<6){message('Informe e-mail e senha com pelo menos seis caracteres.');return}
      try{const {data,error}=await client.auth.signUp({email,password,emailRedirectTo:location.origin+location.pathname});if(error)throw error;message(data.session?'Conta criada. Entrando...':'Verifique seu e-mail para confirmar a conta.');if(data.session)await launch(data.session)}catch(err){message(err.message)}
    });
  });
})();
