(function(){'use strict';
const $=s=>document.querySelector(s);let client=null,started=false;
const errorText=e=>e?.message||String(e);
function setNotice(message){$('#authNotice').textContent=message}
function assertConfigured(){if(!window.supabase?.createClient)throw Error('Biblioteca Supabase não carregada. Verifique a conexão com a internet.');if(!/^https:\/\//.test(window.SUPABASE_URL)||window.SUPABASE_ANON_KEY.startsWith('COLE_AQUI'))throw Error('Configure URL e chave pública em config.js.');}
function requireUser(){const user=client.auth.getUser; if(!client)throw Error('Supabase indisponível');return client.auth.getUser().then(({data,error})=>{if(error||!data.user)throw Error('Sessão expirada. Entre novamente.');return data.user.id})}
function checked({data,error}){if(error)throw error;return data}
window.cloudStore={
 async list(){await requireUser();let all=[];for(let offset=0;;offset+=500){const batch=checked(await client.from('finance_entries').select('payload').order('created_at',{ascending:true}).range(offset,offset+499));all.push(...batch.map(r=>r.payload));if(batch.length<500)break;}return all},
 async apply(ops){const userId=await requireUser();for(const op of ops){if(op.kind==='clear'){checked(await client.from('finance_entries').delete().eq('user_id',userId));continue}if(op.kind==='delete'){checked(await client.from('finance_entries').delete().eq('id',op.id));continue}const row={id:op.item.id,user_id:userId,payload:op.item,updated_at:new Date().toISOString()};if(op.kind==='add'){checked(await client.from('finance_entries').insert(row))}else{checked(await client.from('finance_entries').upsert(row,{onConflict:'user_id,id'}))}}}
};
async function showSignedIn(){setNotice('');$('#authScreen').classList.add('hidden');$('#appShell').classList.remove('hidden');if(!started){started=true;await window.startFinanceApp()}else{await window.reloadFinanceApp()}}
function showSignedOut(){ $('#appShell').classList.add('hidden');$('#authScreen').classList.remove('hidden')}
async function bootstrap(){try{assertConfigured();client=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});const {data,error}=await client.auth.getSession();if(error)throw error;if(data.session)await showSignedIn();else showSignedOut();client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){showSignedOut()}else if(event==='SIGNED_IN'&&started){setTimeout(()=>window.reloadFinanceApp().catch(e=>setNotice(errorText(e))),0)}})}catch(e){setNotice(errorText(e))}}
$('#authForm').addEventListener('submit',async e=>{e.preventDefault();if(!client){setNotice('Configure o Supabase primeiro.');return}try{setNotice('Entrando...');const {error}=await client.auth.signInWithPassword({email:$('#authEmail').value.trim(),password:$('#authPassword').value});if(error)throw error;await showSignedIn()}catch(e){setNotice(errorText(e))}});
$('#signupBtn').addEventListener('click',async()=>{if(!client){setNotice('Configure o Supabase primeiro.');return}try{const {data,error}=await client.auth.signUp({email:$('#authEmail').value.trim(),password:$('#authPassword').value});if(error)throw error;if(data.session)await showSignedIn();else setNotice('Cadastro solicitado. Confirme seu e-mail antes de entrar.')}catch(e){setNotice(errorText(e))}});
$('#logoutBtn').addEventListener('click',async()=>{if(client){const {error}=await client.auth.signOut();if(error)setNotice(errorText(error));else showSignedOut()}});
window.reloadFinanceApp=async()=>{if(typeof window.financeReload==='function')await window.financeReload()};
bootstrap();
})();
