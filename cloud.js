(() => {
 'use strict';
 const cfg=window.FINANCE_CONFIG||{};
 const authScreen=document.getElementById('authScreen');
 const appLayout=document.getElementById('appLayout');
 const notice=document.getElementById('authNotice');
 const email=document.getElementById('authEmail');
 const password=document.getElementById('authPassword');
 const status=document.getElementById('syncStatus');
 const configured=cfg.supabaseUrl?.startsWith('https://') && cfg.supabaseAnonKey && !cfg.supabaseAnonKey.startsWith('COLE_');
 let client, active=false, syncing=Promise.resolve();
 const Cloud=window.Cloud={enabled:false,user:null,sync};
 function message(s){notice.textContent=s}
 function getClient(){
   if(!configured)throw Error('Configure a URL e a chave pública em config.js.');
   if(!window.supabase?.createClient)throw Error('Biblioteca Supabase indisponível. Verifique sua conexão.');
   return client??=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 }
 function getAll(db,store){return new Promise((res,rej)=>{const req=db.transaction(store).objectStore(store).getAll();req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)})}
 function loadSnapshot(db,data){return new Promise((res,rej)=>{
   const tx=db.transaction(['entries','goals'],'readwrite');
   for(const name of ['entries','goals']){const store=tx.objectStore(name);store.clear();for(const item of data[name]||[])store.put(item)}
   tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error);
 })}
 async function remoteSnapshot(){const {data,error}=await getClient().from('finance_data').select('payload').eq('user_id',Cloud.user.id).maybeSingle();if(error)throw error;return data?.payload??null}
 async function sync(db){
   if(!Cloud.enabled)return;
   const userId=Cloud.user.id;
   const snapshot={entries:await getAll(db,'entries'),goals:await getAll(db,'goals')};
   const job=syncing.catch(()=>{}).then(async()=>{
     if(!Cloud.enabled||Cloud.user?.id!==userId)throw Error('Sessão alterada durante sincronização.');
     status.textContent='· sincronizando…';
     const {error}=await getClient().from('finance_data').upsert({user_id:userId,payload:snapshot,updated_at:new Date().toISOString()},{onConflict:'user_id'});
     if(error)throw error;
     status.textContent='· sincronizado';
   });
   syncing=job;return job;
 }
 async function activate(user){
   if(active)return;
   Cloud.user=user;
   message('Carregando seus dados…');
   // IndexedDB individual por usuário; nunca misturar contas.
   const name='meu-financeiro-cloud-'+user.id;
   const db=await new Promise((resolve,reject)=>{
     const req=indexedDB.open(name,2);
     req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains('entries')){const s=d.createObjectStore('entries',{keyPath:'id'});s.createIndex('date','date')}if(!d.objectStoreNames.contains('goals'))d.createObjectStore('goals',{keyPath:'id'})};
     req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
   });
   try{
     const remote=await remoteSnapshot();
     if(remote)await loadSnapshot(db,remote);
     else{
       const localEntries=await getAll(db,'entries'),localGoals=await getAll(db,'goals');
       if(localEntries.length||localGoals.length){
         // O cache local desta conta pode ser recuperado, mas não é sobrescrito por vazio.
         const {error}=await getClient().from('finance_data').upsert({user_id:user.id,payload:{entries:localEntries,goals:localGoals}},{onConflict:'user_id'});
         if(error)throw error;
       }
     }
   }finally{db.close()}
   Cloud.enabled=true;
   active=true;
   authScreen.classList.add('hidden');appLayout.classList.remove('hidden');
   status.textContent='· conectado';
   await window.startFinanceiro();
 }
 async function handleAuth(signUp){
   const btn=document.getElementById(signUp?'signUpBtn':'signInBtn');btn.disabled=true;
   try{
     const c=getClient();const e=email.value.trim(),p=password.value;
     if(!e||p.length<6)throw Error('Informe um e-mail e uma senha com pelo menos 6 caracteres.');
     if(signUp){
       const redirect=location.origin+location.pathname;
       const {data,error}=await c.auth.signUp({email:e,password:p,options:{emailRedirectTo:redirect}});
       if(error)throw error;
       if(data.session&&data.user)await activate(data.user);
       else message('Cadastro solicitado. Confira seu e-mail para confirmar a conta e depois faça login.');
     }else{
       const {data,error}=await c.auth.signInWithPassword({email:e,password:p});
       if(error)throw error;
       await activate(data.user);
     }
   }catch(err){message(err.message)}finally{btn.disabled=false}
 }
 document.getElementById('authForm').addEventListener('submit',e=>{e.preventDefault();handleAuth(false)});
 document.getElementById('signUpBtn').addEventListener('click',()=>handleAuth(true));
 document.getElementById('logoutBtn').addEventListener('click',async()=>{
   if(!confirm('Sair da conta?'))return;
   try{await syncing.catch(()=>{});await getClient().auth.signOut();location.reload()}catch(err){alert(err.message)}
 });
 (async()=>{
   try{
     const c=getClient();
     const {data,error}=await c.auth.getUser();
     if(!error&&data.user)await activate(data.user);
     else message('Entre ou crie uma conta para começar.');
   }catch(err){message(err.message)}
 })();
})();
