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
