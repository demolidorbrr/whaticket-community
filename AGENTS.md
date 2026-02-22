# AGENTS.md

## Objetivo
Este repositório é mantido por humanos e agentes. O agente deve priorizar:
- mudanças pequenas e seguras;
- consistência com padrões já existentes;
- qualidade (tests/lint/build) antes de finalizar.

## Regras gerais de atuação
- Responda em português-BR.
- Você é o melhor programador do mundo, seja sempre cirúrgico, altere somente o que a tarefa pede. 
- Não invente funcionalidades que não foram solicitadas.
- Sempre comente o código para facilitar ajustes.
- Utilize boas práticas de programação e reuso de código.
1. **Leia o contexto do projeto**: antes de alterar código, verifique `README`, `package.json`/`composer.json`, scripts e padrões existentes.
2. **Siga o padrão do repo**: copie estilo, estrutura, nomes e abordagem já usados. Não “invente” arquitetura nova.
3. **Evite refatorações paralelas**: não faça mudanças cosméticas/formatting em arquivos não relacionados ao objetivo.
4. **Mudanças mínimas**: prefira diffs pequenos; se precisar de algo maior, faça em etapas.
5. **Compatibilidade**: mantenha compatibilidade de API/contratos; mudanças breaking exigem justificativa e atualização de docs/tests.
6. **Não quebre o build**: finalize apenas quando os checks principais passarem (ver seção “Verificações”).

## Segurança
- Nunca exponha/commite segredos (tokens, chaves, cookies, `.env`).
- Valide entradas externas (request, webhook, payloads).
- Evite SSRF, path traversal, command injection: sanitize e use libs seguras.
- Dependências novas: só adicionar se for realmente necessário, e preferir libs já adotadas no repo.

## Regras obrigatorias de multi-empresa (tenant)
- Nunca remover, desativar ou alterar sem solicitacao explicita os modulos de revenda/superadmin (`Company`, `Plan`, rotas e tela de `Settings` com Empresas/Planos).
- Nao alterar, limpar, deduplicar, importar, excluir ou reformatar dados/rotinas de `Contacts` sem solicitacao explicita do usuario nesta conversa.
- Nao alterar o fluxo estabilizado de mensagens WhatsApp (`wwebjs`, eventos `message_create/media_uploaded`, defaults de processamento de `fromMe`, timeouts/fallbacks de contato/chat e `SetTicketMessagesAsRead`) sem solicitacao explicita do usuario nesta conversa.
- Nao remover/alterar o `autoComplete` de senha em telas/modais de autenticacao e cadastro de usuario sem solicitacao explicita do usuario nesta conversa.
- Em qualquer endpoint autenticado de dados operacionais (`Users`, `Contacts`, `Tickets`, `Queues`, `Tags`, `Whatsapps`, `QuickAnswers`, `Schedules`), aplicar filtro por `companyId` para perfis nao-superadmin.
- Em `create/update/delete`, validar que o recurso pertence ao `companyId` da sessao antes de persistir.
- Nunca executar update/delete em massa sem clausula de tenant (`WHERE companyId = ...`) para perfis nao-superadmin.
- Em eventos de websocket, emitir apenas em salas da empresa (company room), nunca em broadcast global para dados operacionais.
- Se adicionar novo model com `companyId`, manter associacao com `Company` e validar escopo de tenant no acesso.
- Ao editar auth/permissoes, garantir:
  - `superadmin` pode acessar configuracoes globais (Empresas/Planos);
  - `admin/user` nao acessam configuracoes globais.
- Antes de finalizar alteracoes que toquem backend/queries/permissoes, rodar smoke test A/B de tenant e registrar resultado:
  - Tenant A nao pode visualizar/editar dados do Tenant B.
  - Tenant B nao pode visualizar/editar dados do Tenant A.
  - Superadmin acessa Empresas/Planos.

## Performance e confiabilidade
- Evite N+1 e loops com chamadas remotas repetidas.
- Prefira operações idempotentes quando fizer sentido (webhooks, retries).
- Cache e timeouts devem ser explícitos quando existir I/O de rede.

## Verificações antes de finalizar (rodar quando aplicável)
> Ajuste os comandos para o seu repo.
- Node/TS:
  - `npm run lint`
  - `npm run test`
  - `npm run build`
- PHP:
  - `composer test` / `phpunit`
  - `phpstan` (se existir)
  - `php-cs-fixer fix` (se existir)
- Frontend:
  - `npm run typecheck`
  - `npm run test`
  - `npm run build`
