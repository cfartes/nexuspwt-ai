# Diagnóstico da conexão WhatsApp

## Resposta HTML no aplicativo

`Unexpected token '<', '<!DOCTYPE ... is not valid JSON` significa que o navegador recebeu HTML ao consultar uma API que deveria devolver JSON. Pode ser uma página de erro ou redirecionamento do app/proxy. A mensagem sozinha não identifica qual serviço falhou.

O app agora mostra erro legível com o status HTTP, preserva o intervalo de espera em respostas 429 e não exibe o corpo HTML. Se o OpenWA devolver estado `FAILED`, a tela identifica **Falha ao iniciar sessão no OpenWA**, retira o QR e desativa avisos. Consultar o estado não cria outra sessão; reconectar procura reutilizar a sessão exclusiva da empresa.

## Erro no painel OpenWA

`Cannot read properties of null (reading 'Socket')` indica acesso a uma propriedade de um objeto nulo no gateway. Para localizar a causa é necessário obter a pilha do erro, com arquivo/linha e mensagens imediatamente anteriores. A correção do tratamento JSON no app não resolve esse erro interno do gateway.

1. No painel OpenWA, use **Reconectar** somente na sessão Nexus PTW em falha e anote o horário da tentativa.
2. Se persistir, liste os containers na VPS para identificar o backend OpenWA:

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
```

3. Substitua o nome abaixo pelo container do backend OpenWA e consulte apenas o trecho do erro:

```bash
docker logs --since 15m --tail 500 NOME_CONTAINER_OPENWA 2>&1 | grep -F -B 3 -A 15 'Cannot read properties of null'
```

Se o trecho não aparecer, consulte os logs da tentativa no painel do gateway. Compartilhe a pilha do erro e a imagem/versão do backend, removendo senhas, API Keys, tokens, cookies e dados de pareamento.

Esses comandos são somente de leitura. Não reinicie o gateway inteiro nem exclua sessões de outros aplicativos para investigar esta sessão. Reiniciar toda a stack pode afetar o RotaFY e outros clientes conectados.

## Publicação da correção do app

Use o atualizador existente:

```bash
curl -fsSL https://raw.githubusercontent.com/cfartes/nexuspwt-ai/main/scripts/update_vps.sh -o /tmp/update-nexus-ptw.sh && bash /tmp/update-nexus-ptw.sh
```

Não há nova migração de banco nesta correção. Atualize a aba pelo aviso do app. A validação automatizada usa provedores simulados; não confirma a recuperação do Socket na VPS do OpenWA.
