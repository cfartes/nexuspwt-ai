# Documenso na VPS

O usuário fará a instalação. Os arquivos desta pasta preparam uma instância separada do Nexus; não alteram a instalação existente do OpenWA.

Referências oficiais consultadas: [Docker Compose](https://docs.documenso.com/docs/self-hosting/deployment/docker-compose), [variáveis](https://docs.documenso.com/docs/self-hosting/configuration/environment), [certificado](https://docs.documenso.com/docs/self-hosting/configuration/signing-certificate).

## Instalação

1. Copie esta pasta para um diretório próprio na VPS, por exemplo `/opt/nexus-documenso`.
2. Copie `.env.example` para `.env` e preencha domínio, senha do banco, SMTP e os três segredos independentes. Para cada segredo, gere um valor separado com `openssl rand -hex 32`. Não reutilize as chaves de criptografia nem as troque após armazenar dados sem seguir o procedimento de rotação do projeto.
3. Coloque um certificado PKCS#12 válido no arquivo `cert.p12`, configure a senha em `NEXT_PRIVATE_SIGNING_PASSPHRASE` e conceda leitura ao usuário do container. Guarde backup seguro do certificado e das chaves. O container não deve ficar com permissão de escrita no certificado.
4. Confira a configuração: `docker compose config --quiet`.
5. Execute `docker compose up -d` e acompanhe `docker compose logs --tail=100 documenso`. Evite compartilhar logs ou configuração que contenham segredos.
6. Configure seu proxy HTTPS para o domínio das assinaturas apontar para `127.0.0.1:3020`. Certificado HTTPS e certificado de assinatura PDF são diferentes.
7. Crie a conta inicial e a equipe; depois configure `NEXT_PUBLIC_DISABLE_SIGNUP=true` e recrie o serviço com `docker compose up -d` para fechar o cadastro público.
8. Faça um teste com documento sem dados reais: envio, assinatura, recebimento de e-mail, download e conferência do PDF.
9. Gere um token da equipe pela interface e configure-o no ambiente do Nexus, junto com a URL pública. Não cole o token no chat nem no código. A integração será implementada após validar a instância e o contrato da API da versão instalada.

O Compose fixa `ghcr.io/documenso/documenso:v2.21.1`, versão estável verificada no repositório em 17/11/2026. Antes de mudar de versão, faça backup e confira as notas de atualização. A imagem não foi baixada/executada nesta estação.

## Certificado para teste

Um certificado autoassinado permite testar a integração, mas não significa identidade individual certificada nem assinatura ICP-Brasil. A modalidade aceita para APR/PT deve ser definida com o contratante. Para produção, use o certificado e o processo aprovados por ele.

## Backup

Documentos ficam no PostgreSQL nesta configuração. Guarde backup externo do banco, `.env` e `cert.p12`, com controle de acesso. O volume Docker protege reinicializações, não é um backup. Teste uma restauração antes de documentos reais. `docker compose down` preserva o volume; não utilize `down -v` com dados que precisam ser mantidos.

## Pontos de integração ainda pendentes

- Confirmar API v2 e recursos disponíveis na edição comunitária instalada.
- Decidir quando congelar cada PDF: APR, liberação PT, revalidação e encerramento são momentos distintos.
- Criar documentos e signatários, posicionar os campos, obter links, receber eventos autenticados e arquivar PDFs finais.
- Integrar conta do Nexus com o fluxo de identificação do signatário; possuir um link sozinho não deve ser tratado como autenticação no Nexus.
- Testar múltiplas empresas/equipes para não compartilhar documentos entre clientes.
