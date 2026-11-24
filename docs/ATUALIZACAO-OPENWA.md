# Atualização do OpenWA 0.24.0 para 0.32.0

Procedimento preparado para o container `openwa-api` e os arquivos informados da VPS:

- `/opt/openwa/docker-compose.yml`
- `/opt/openwa/nexus-media.override.yml`

O erro observado em `whatsapp-web.js/src/Client.js` corresponde ao caminho descrito no [issue 1997](https://github.com/rmyndharis/OpenWA/issues/1997). A correção foi publicada em 0.29.0; o destino deste procedimento é a [versão 0.32.0](https://github.com/rmyndharis/OpenWA/releases/tag/v0.32.0), atual em 24/11/2026. A nova versão usa WhatsApp Web nativo por padrão; o script fixa `WWEBJS_WEB_VERSION=off` explicitamente.

## Executar na VPS

### Correção do QR Code na versão 0.32.0

Se a versão instalada já é 0.32.0 e novas sessões falham com `auth timeout`, URL `/login/` e `WAWebSocketModel` ausente, use:

```bash
curl -fsSL https://raw.githubusercontent.com/cfartes/nexuspwt-ai/main/scripts/upgrade_openwa.py -o /tmp/upgrade-openwa.py && python3 /tmp/upgrade-openwa.py --fix-login
```

Esse é o problema [whatsapp-web.js #201988](https://github.com/wwebjs/whatsapp-web.js/issues/201988), corrigido pelo [PR oficial #201990](https://github.com/wwebjs/whatsapp-web.js/pull/201990). O script fixa o commit `38eb45b2759450cc6fccb6a7a3f2cbc3bdb87db2` e verifica o SHA-256 do diff antes de aplicá-lo. Exige Git, OpenWA 0.32.0 e whatsapp-web.js 1.34.8; não instala dependências na VPS.

Primeiro copia somente o `Client.js` instalado para um diretório temporário e aplica os hunks oficiais com `git apply --check`, preservando as adaptações do OpenWA. Conflito, download inválido ou versão diferente abortam antes de parar qualquer sessão. A imagem local deriva do ID exato da imagem ativa, mantém o mesmo Chromium e passa pela verificação de sintaxe do Node. Não altera o arquivo dentro do container ativo.

Depois reutiliza o procedimento de backup consistente, migração e subida descrito abaixo. O override gerenciado mantém suas configurações existentes, incluindo `WWEBJS_AUTH_TIMEOUT_MS`, e passa a apontar para `nexus-openwa-login:<imagem-base>-<commit>`. A chave de API, os bancos e os diretórios de autenticação são preservados. A pausa afeta todas as sessões desse gateway, inclusive Nexus Atende; não envia mensagens e não apaga sessões.

Ao concluir, no painel OpenWA, reconecte uma vez a sessão PTW e confira o QR Code. Confira também se a sessão Nexus Atende retomou. Não execute o script sem `--fix-login` depois disso: a imagem oficial 0.32.0 contém a biblioteca anterior e voltaria a introduzir o problema. Esta imagem local é uma solução temporária até uma atualização oficial do OpenWA incorporar a correção; não publique a imagem como versão oficial.

Validação local desta correção: 13 testes Linux com Docker simulado; aplicação real do patch sobre o `Client.js` da imagem oficial 0.32.0; construção da imagem derivada; verificação de sintaxe; evento `qr` gerado em navegador isolado com a biblioteca corrigida. Nenhum telefone foi pareado. Isso não confirma autenticação completa, envio de mensagens ou retomada das sessões da VPS.

### Atualização inicial de 0.24.0 para 0.32.0

Como root:

```bash
curl -fsSL https://raw.githubusercontent.com/cfartes/nexuspwt-ai/main/scripts/upgrade_openwa.py -o /tmp/upgrade-openwa.py && python3 /tmp/upgrade-openwa.py
```

Não é uma reinstalação. Há uma pausa das conexões WhatsApp atendidas pelo OpenWA, inclusive PTW e RotaFY. O script não reinicia Docker/Traefik, bancos ou containers dos outros apps, nem envia mensagens de teste.

## O que o script faz

1. Confere o container, projeto e serviço Compose e exige volume persistente em `/app/data`. O serviço é obtido das labels do Docker, podendo se chamar `openwa` ou outro nome, desde que o Compose aponte para o container `openwa-api`. A tela mostra os nomes e os arquivos identificados, sem credenciais. Caminhos relativos e espaços na lista de arquivos são normalizados; arquivos adicionais desconhecidos continuam bloqueados.
2. Preserva cópias dos dois arquivos Compose, `.env`, metadados privados do container e uma tag local da imagem antiga.
3. Valida que os volumes do Compose correspondem exatamente aos volumes ativos. Divergência cancela antes de parar o serviço.
4. Baixa a imagem oficial `ghcr.io/rmyndharis/openwa:0.32.0` e confere sua versão antes da pausa.
5. Para apenas `openwa-api`. Usa a imagem antiga e o script oficial de backup para arquivar bancos SQLite/PostgreSQL e estado de autenticação com o gateway parado. O arquivo é validado como tar gzip.
6. Grava o override gerenciado `/opt/openwa/nexus-version.override.json`, fixando imagem, versão nativa do WhatsApp Web e identidade do nó anterior.
7. Executa `migration:run:prod` na imagem nova e inicia somente `openwa-api`, com os mesmos volumes e redes, aguardando a saúde e conferindo a versão em execução.

O backup é salvo em `/opt/openwa/backups/nexus-upgrade-<UTC>/`, com acesso restrito. O diretório contém credenciais: não compartilhe `container-before.json`, `backup-compose.json`, `.env` ou o arquivo de backup. Logs de backup/migração também ficam nesse diretório; revise e oculte segredos antes de compartilhar trechos de erro.

O arquivamento segue o [procedimento oficial](https://github.com/rmyndharis/OpenWA/blob/main/docs/11-operational-runbooks.md). Mídia armazenada em S3/bucket não é copiada pelo backup local e precisa de backup próprio.

## Depois da atualização

Confira o painel OpenWA. Sessões que não retomarem automaticamente devem ser iniciadas no próprio painel; o script não muda a política de início automático. Confira as sessões usadas pelo RotaFY antes de voltar a validar o PTW. No PTW, use Conectar/Atualizar conexão para recuperar o vínculo ou gerar o QR da sua sessão. As chaves existentes devem continuar no mesmo banco; não gere novas sem necessidade.

Nos próximos comandos Compose do OpenWA, use os **três arquivos**, pois o terceiro fixa a imagem nova:

```bash
cd /opt/openwa
docker compose -f docker-compose.yml -f nexus-media.override.yml -f nexus-version.override.json ps
```

Não use `down -v` nem exclua volumes ou diretórios de sessão.

## Se falhar

- Antes das migrações: o script tenta iniciar novamente o container antigo. Nenhuma imagem nova terá aberto os perfis.
- Depois de iniciar as migrações: o script para o serviço e indica o diretório de backup/logs. Não faz downgrade automático, porque a versão nova pode ter alterado bancos e perfis do navegador.

Nesse segundo caso, obtenha o trecho do `migration.log` ou da saída da subida, sem credenciais, antes de repetir a operação. Para recuperar a versão antiga, é necessário restaurar o arquivo de backup **anterior** à atualização usando `restore.sh`, incluindo bancos e autenticações, e então usar a imagem antiga registrada em `rollback-image.txt`. Siga o bloco de rollback do procedimento oficial com os três arquivos Compose desta instalação. Trocar apenas a tag para 0.24.0 pode invalidar os logins por causa da mudança de versão do Chrome.

Validação local: dez testes Linux com Docker simulado cobrem caminho normal, nome alternativo do serviço, caminhos relativos/espaços, recusa de arquivo adicional/container errado, divergência de volumes/configuração de banco, falha de backup, migração e saúde. Esses testes não confirmam download da imagem, restauração de backup real ou reconexão das sessões da VPS. Nenhuma atualização real foi executada pelo assistente.
