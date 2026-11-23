# Meu Financeiro v2.0 Online — versão de testes

Base: `app(2).js`, `index(2).html`, `style(2).css` enviados pelo usuário.

## Antes de publicar

1. Faça **backup** do aplicativo atual (exportação JSON e cópia do repositório). **Não substitua a versão estável diretamente.**
2. No projeto Supabase **existente**, abra **SQL Editor** e execute `supabase-v2.sql`. O script cria a tabela `finance_v2_data` e a função `finance_v2_save`, sem apagar tabelas antigas.
3. Abra `config.js` e preencha a URL exata do projeto e a chave **publishable/anon**. Nunca coloque chaves secretas ou `service_role` no GitHub.
4. Publique todos os arquivos `.html`, `.css`, `.js` na **raiz de uma branch ou repositório de testes do GitHub Pages**. Não publique o arquivo SQL como página necessária.
5. Abra a URL HTTPS publicada e entre com a conta Supabase existente. Caso precise confirmar e-mail, configure **Authentication → URL Configuration** no Supabase com a URL de teste em Redirect URLs.
6. Faça um lançamento fictício e confira o status em **Configurações → Sincronização**. Abra em outro navegador e confirme que aparece.
7. Para migrar lançamentos de uma versão anterior, use **Configurações → Restaurar backup** com JSON exportado da versão antiga. **O banco antigo não é importado automaticamente**. A importação substitui os dados atuais da conta v2: faça backup antes.

## Estrutura

- `index.html`: interface e formulários de login.
- `style.css`: tema responsivo.
- `app.js`: dashboard, lançamentos, parcelas, faturas, objetivos, análises, categorias personalizadas e cache IndexedDB isolado por usuário.
- `cloud.js`: login Supabase, carga dos dados e sincronização com controle de revisão.
- `config.js`: URL e chave pública (precisa preencher).
- `supabase-v2.sql`: tabela RLS e função de gravação com detecção de conflitos.

## Limitações importantes

- **Versão de testes, não validada contra o seu Supabase real.** A sintaxe JS foi verificada, mas os fluxos de login, banco e sincronização precisam ser testados.
- Os dados v2 ficam numa tabela nova, **separados dos dados da versão antiga**. Não exclua sua tabela anterior.
- Alterações em dois dispositivos simultaneamente podem gerar conflito. Nesse caso o app **bloqueia a sobrescrita remota** e mantém a cópia local. Faça backup JSON do dispositivo com alterações antes de atualizar/recarregar; concilie manualmente.
- Se a conexão cair, o cache local pode receber alterações ainda não enviadas. Evite fechar a aba até sincronizar e faça backup se necessário. O app não garante reconciliação automática após reiniciar.
- Ao sair da conta, o app solicita confirmação se houver alterações pendentes.
- O Supabase JS é carregado via CDN, portanto a página precisa de internet para autenticação.
- O JSON de backup contém informações financeiras pessoais: guarde-o com segurança.

## Testes recomendados

- Login na janela normal e anônima.
- Criar categoria personalizada em Configurações; usá-la em um lançamento; editar e confirmar que foi preservada.
- Lançamento de R$ 1.200 em 6 parcelas; conferir R$ 200 por mês.
- Filtrar análises por categoria/tag/status e navegar meses.
- Criar objetivo e registrar aporte.
- Exportar JSON, importar numa conta de teste e verificar os totais.
- Verificar sincronização entre navegador e celular **um de cada vez**.

## Publicação segura

Use uma branch ou repositório de testes. Após validar todas as funções, publique no repositório principal. Se houver erro, basta voltar aos arquivos estáveis — a tabela `finance_v2_data` é independente.
