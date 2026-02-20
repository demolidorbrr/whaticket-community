# Evolucao Whaticket - IA, Kanban e Omnichannel

## Objetivo
- IA por fila para triagem e resposta inicial.
- Supervisor IA para rotear ticket (fila, atendente, status).
- Operacao visual em Kanban com drag-and-drop.
- Base omnichannel com entrada e saida via webhook.
- SLA com escalonamento automatico.
- Score de lead + tags automaticas.
- Metricas de IA por fila no dashboard.

## Entregas implementadas
- Kanban operacional em `Tickets` com colunas:
  - `pending`
  - `open`
  - `closed`
- Drag-and-drop no Kanban atualiza status do ticket via API.
- IA por fila no cadastro de filas:
  - `aiEnabled`
  - `aiMode` (`triage`, `initial_reply`, `hybrid`)
  - `aiAutoReply`
  - `aiPrompt`
  - `aiWebhookUrl`
- Processamento IA no recebimento de mensagens:
  - chama webhook (n8n/OpenAI)
  - aplica transferencia de fila/atendente/status
  - registra eventos de auditoria (`TicketEvents`)
  - envia resposta automatica quando permitido
- CRM automation no ticket:
  - `leadScore`
  - `channel`
  - `slaDueAt`
  - `firstHumanResponseAt`
  - `resolvedAt`
- Tabelas novas:
  - `Tags`
  - `TicketTags`
  - `TicketEvents`
- SLA automatico:
  - inicia contador em mensagem recebida
  - escalona tickets vencidos por job (a cada 60s)
  - rota opcional para fila de escalonamento
- Dashboard admin com tabela de metricas IA por fila:
  - resolvidos
  - transferencias IA
  - respostas IA
  - media ate primeiro humano
- Omnichannel base:
  - endpoint inbound `POST /channels/inbound`
  - outbound para webhook quando `ticket.channel != whatsapp`

## Contrato IA (Whaticket -> n8n)
### Payload enviado
```json
{
  "event": "queue.assistant.incoming_message",
  "queue": {
    "id": 1,
    "name": "Comercial",
    "aiMode": "hybrid",
    "aiPrompt": "Prompt da fila",
    "aiAutoReply": true
  },
  "ticket": {
    "id": 123,
    "status": "pending",
    "queueId": 1,
    "userId": null
  },
  "contact": {
    "id": 45,
    "name": "Cliente",
    "number": "5511999999999"
  },
  "message": {
    "id": "ABC",
    "body": "Oi, quero contratar",
    "fromMe": false,
    "type": "chat"
  }
}
```

### Resposta esperada do n8n
```json
{
  "reply": "Oi! Posso te ajudar com plano Basico, Pro ou Enterprise.",
  "transferQueueId": 2,
  "assignUserId": 7,
  "ticketStatus": "open",
  "closeTicket": false,
  "leadScore": 70,
  "leadScoreDelta": 10,
  "tags": ["lead quente", "orcar"]
}
```

## Contrato Omnichannel
### Inbound
- Endpoint: `POST /channels/inbound`
- Header opcional de seguranca:
  - `x-channel-token: <CHANNEL_WEBHOOK_TOKEN>`
- Exemplo:
```json
{
  "channel": "instagram",
  "externalId": "17841400000000000",
  "name": "Cliente Insta",
  "body": "Quero saber preco",
  "queueId": 1
}
```

### Outbound
- Quando agente envia mensagem em ticket com `channel` diferente de `whatsapp`, o sistema dispara webhook:
  - `event: channel.outbound.message`
  - payload inclui `channel`, `ticketId`, `queueId`, `contact`, `message`

## Variaveis de ambiente
- IA supervisor:
  - `AI_N8N_WEBHOOK_URL`
  - `AI_N8N_WEBHOOK_TOKEN`
  - `AI_N8N_WEBHOOK_TIMEOUT_MS`
- Omnichannel:
  - `CHANNEL_WEBHOOK_TOKEN`
  - `OMNICHANNEL_OUTBOUND_WEBHOOK_URL`
  - `OMNICHANNEL_WEBHOOK_TOKEN`
  - `OMNICHANNEL_WEBHOOK_TIMEOUT_MS`

## Configuracao SLA
No menu `Configuracoes` (admin):
- `SLA - Escalonamento ativo`
- `SLA - Minutos para primeira resposta`
- `SLA - Fila de escalonamento`

## Proximo ciclo sugerido
- Integracao oficial Meta Graph (Instagram/Messenger) com webhooks assinados.
- Widget Webchat nativo para site.
- Editor visual de regras de supervisor IA por fila.
- Tela de tags (CRUD) e filtros por score/tag no inbox.
- Dashboards comparativos por periodo e por fila.

