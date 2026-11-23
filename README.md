# Meu Financeiro Online v1.7

Aplicação estática (HTML/CSS/JS), com autenticação Supabase, banco PostgreSQL e RLS por usuário. Mantém dashboard, parcelas, projeções, análises, tags e backups da v1.6.

## Configuração
1. Crie projeto em https://supabase.com/dashboard.
2. Abra SQL Editor e execute `schema.sql`.
3. Em Authentication > Providers, mantenha Email ativo; recomenda-se confirmação por e-mail. Em URL Configuration, defina Site URL e URLs de redirecionamento para o endereço HTTPS de produção.
4. Em Project Settings > API (ou Connect), copie Project URL e chave pública `anon`/`publishable` para `config.js`. **Nunca use `service_role` ou secret no frontend.**
5. Crie repositório GitHub, envie os arquivos (index.html, style.css, app.js, cloud.js, config.js). Em Settings > Pages, selecione Deploy from branch, `main`, `/ (root)` e aguarde a URL HTTPS. Alternativa: Cloudflare Pages com deploy de site estático.
6. Abra a URL HTTPS no celular ou PC, crie a conta e confirme o e-mail. Entre com as mesmas credenciais nos dois dispositivos.
7. Em Configurações, importe o backup JSON da v1.6 (opção **Adicionar lançamentos de JSON**), ou migre dados locais se estiver na mesma origem. Confira duplicidades.

## Segurança e dados
- A chave pública é exposta intencionalmente. A proteção dos dados é feita pela autenticação e pelas políticas RLS no SQL.
- Não desative RLS. Não compartilhe sua senha. Ative MFA no Supabase se disponível no fluxo escolhido.
- Backups JSON são confidenciais: guarde em local seguro.
- Este projeto requer internet para autenticação e gravação. Não possui edição offline com sincronização posterior.
- O login usa a biblioteca supabase-js via CDN; o aplicativo depende desse recurso estar disponível.
- Em caso de mudança de domínio, atualize as URLs permitidas no Supabase.
- Importar backup com opção restaurar **substitui todos os lançamentos da conta**.
- O botão limpar dados apaga todos os lançamentos da conta na nuvem.
- Teste o fluxo com dados fictícios antes de migrar dados reais.

## Estrutura
- `index.html` interface
- `style.css` aparência
- `app.js` cálculos e telas da v1.6 adaptados
- `cloud.js` autenticação e operações remotas
- `config.js` parâmetros públicos Supabase
- `schema.sql` banco e políticas de acesso

## Desenvolvimento local
Para testes, rode `python -m http.server 8000` e abra http://localhost:8000. Inclua localhost nas URLs permitidas do Supabase. Para uso em produção, utilize HTTPS.
