ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE documents ADD CONSTRAINT documents_status_check
 CHECK(status IN ('rascunho','em_aprovacao','aprovado','rejeitado','encerrado'));
