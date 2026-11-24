# Atualização do OpenWA 0.24.0 para 0.32.0

Procedimento preparado para o container `openwa-api` e os arquivos informados da VPS:

- `/opt/openwa/docker-compose.yml`
- `/opt/openwa/nexus-media.override.yml`

O erro observado em `whatsapp-web.js/src/Client.js` corresponde ao caminho descrito no [issue 1997](https://github.com/rmyndharis/OpenWA/issues/1997). A correção foi publicada em 0.29.0; o destino deste procedimento é a [versão 0.32.0](https://github.com/rmyndharis/OpenWA/releases/tag/v0.32.0), atual em 24/11/2026. A nova versão usa WhatsApp Web nativo por padrão; o script fixa `WWEBJS_WEB_VERSION=off` explicitamente.

## Executar na VPS

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
