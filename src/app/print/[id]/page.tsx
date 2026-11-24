import { currentUser, unitAccess, assertContractorAccess, assertDocumentRead } from '@/lib/auth';
import { db } from '@/lib/db';
import { uuid } from '@/lib/validation';
import { visibleSections } from '@/lib/forms';
import { dateLabel, type DocumentRow } from '@/lib/types';
import { redirect, notFound } from 'next/navigation';
import PrintButton from '@/components/print-button';
import './print.css';
export const dynamic = 'force-dynamic';
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const user = await currentUser().catch(() => null);
  if (!user) redirect('/');
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const {
    rows: [doc],
  } = await db.query(
    'SELECT d.*,c.name contractor,u.name unit,c2.name company FROM documents d JOIN contractors c ON c.id=d.contractor_id JOIN units u ON u.id=d.unit_id JOIN companies c2 ON c2.id=d.company_id WHERE d.id=$1',
    [id],
  );
  if (!doc) notFound();
  const unit = await unitAccess(user, doc.unit_id).catch(() => null);
  if (!unit) notFound();
  const requestedVersion = (await searchParams).version;
  const version = requestedVersion === undefined ? doc.version : Number(requestedVersion);
  if (!Number.isSafeInteger(version) || version < 1) notFound();
  const {
    rows: [archived],
  } = await db.query('SELECT snapshot FROM document_versions WHERE document_id=$1 AND version=$2', [
    id,
    version,
  ]);
  if (!archived && version !== doc.version) notFound();
  const historical = version !== doc.version;
  const d = {
    ...doc,
    ...(archived?.snapshot || {}),
    starts_at: archived?.snapshot.starts_at || doc.starts_at.toISOString(),
    ends_at: archived?.snapshot.ends_at || doc.ends_at.toISOString(),
  } as DocumentRow & { contractor: string; unit: string; company: string };
  try {
    assertContractorAccess(unit, d.contractor_id);
  } catch {
    notFound();
  }
  const {
    rows: [contractor],
  } = await db.query('SELECT name FROM contractors WHERE id=$1', [d.contractor_id]);
  d.contractor = contractor.name;
  const { rows: approvals } = await db.query(
    'SELECT a.*,u.name FROM approvals a JOIN users u ON u.id=a.user_id WHERE a.document_id=$1 AND (a.version=$2 OR ($3::boolean AND a.version=$2-1)) ORDER BY a.profile',
    [id, d.version, d.kind === 'PT' && d.status === 'encerrado'],
  );
  const approved = approvals.length > 0 && approvals.every((a) => a.decision === 'aprovado');
  try {
    await assertDocumentRead(db, user, unit, d, approved);
  } catch {
    notFound();
  }
  if (
    unit.role === 'executante' &&
    d.created_by !== user.id &&
    !(d.kind === 'APR' && approved) &&
    !d.data.executors.some((e) => e.userId === user.id)
  )
    notFound();
  const { rows: people } = await db.query('SELECT id,name FROM users WHERE id=ANY($1::uuid[])', [
    d.data.executors.map((e) => e.userId),
  ]);
  const { rows: photos } = await db.query(
    'SELECT id,caption,captured_at,latitude,longitude,accuracy FROM photos WHERE document_id=$1 AND $2=false ORDER BY received_at',
    [id, historical],
  );
  return (
    <div className={'print-document ' + d.kind}>
      <div className="print-toolbar">
        <div>
          <strong>Prévia de impressão</strong>
          <small>
            Modelo inicial estruturado. Reprodução fiel do formulário ainda em validação.
          </small>
          {historical && <small>Versão histórica arquivada · Revisão {version}</small>}
        </div>
        <PrintButton />
      </div>
      <article className="paper">
        {doc.removed_at && (
          <p>
            <strong>
              APR REMOVIDA DA OPERAÇÃO — mantida somente para histórico. Não utilizar para execução
              de serviços.
            </strong>
          </p>
        )}
        <header className="print-header">
          <strong>{d.company}</strong>
          <div>
            <h1>
              {d.kind === 'APR'
                ? 'ANÁLISE PRELIMINAR DE RISCOS / DECLARAÇÃO DE MÉTODOS'
                : 'PERMISSÃO DE TRABALHO INTEGRADA'}
            </h1>
            <p>
              {d.kind}-{String(d.number).padStart(5, '0')} · Revisão {d.version} · {d.unit}
            </p>
          </div>
        </header>
        <div className="print-warning">
          DOCUMENTO DO PILOTO · NÃO AUTORIZA EXECUÇÃO · ASSINATURA ELETRÔNICA NÃO INTEGRADA
        </div>
        <table className="print-identification">
          <tbody>
            <tr>
              <th>Empresa contratada</th>
              <td>{d.contractor}</td>
              <th>Local</th>
              <td>{d.location}</td>
            </tr>
            <tr>
              <th>Início previsto</th>
              <td>{dateLabel(String(d.starts_at))}</td>
              <th>Término previsto</th>
              <td>{dateLabel(d.ends_at)}</td>
            </tr>
            <tr>
              <th>Descrição dos trabalhos</th>
              <td colSpan={3}>{d.title}</td>
            </tr>
            {d.kind === 'APR' && (
              <>
                <tr>
                  <th>Responsável da contratada</th>
                  <td>
                    {d.data.answers.companyOwner} {d.data.answers.companyPhone}
                  </td>
                  <th>Segurança da contratada</th>
                  <td>
                    {d.data.answers.safetyOwner} {d.data.answers.safetyPhone}
                  </td>
                </tr>
                <tr>
                  <th>Emissão</th>
                  <td>{d.data.answers.issuedAt}</td>
                  <th>Data revisão</th>
                  <td>{d.data.answers.revisionDate}</td>
                </tr>
              </>
            )}
            {d.kind === 'PT' && (
              <tr>
                <th>APR vinculada</th>
                <td colSpan={3}>
                  <a href={`/print/${d.apr_id}?version=${d.apr_version}`}>
                    APR vinculada · versão {d.apr_version} · {d.apr_id}
                  </a>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {d.kind === 'APR' ? (
          <table className="risk-print">
            <thead>
              <tr>
                {[
                  'Sequência de atividades',
                  'Técnicas / ferramentas / equipamentos',
                  'Descrição dos riscos',
                  'Possibilidade SIF',
                  'Medidas de precaução e controle',
                  'Fotos ilustrativas',
                  'Necessita PT?',
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.data.risks.map((r, i) => (
                <tr key={i}>
                  <td>
                    {i + 1}. {r.activity}
                  </td>
                  <td>{r.tools}</td>
                  <td>{r.risks}</td>
                  <td>{r.sif}</td>
                  <td>{r.controls}</td>
                  <td>—</td>
                  <td>{r.needsPt ? 'Sim' : 'Não'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <>
            <div className="print-section">
              <h2>8 · Classificação da atividade</h2>
              <p>{d.data.types.join(' · ')}</p>
              <h2>10 · EPIs conforme avaliação</h2>
              <p>{d.data.ppe.join(' · ')}</p>
            </div>
            <div className="pt-print-sections">
              {visibleSections(d.data.types, d.data.answers).map((s) => (
                <section className="print-section" key={s.id}>
                  <h2>{s.title}</h2>
                  {s.fields.map((f) => (
                    <div className="print-answer" key={f.key}>
                      <span>{f.label}</span>
                      <b>{d.data.answers[`${s.id}.${f.key}`] || '—'}</b>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </>
        )}
        <section className="print-section">
          <h2>Executantes</h2>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Função</th>
                <th>Assinaturas</th>
              </tr>
            </thead>
            <tbody>
              {d.data.executors.map((e) => (
                <tr key={e.userId}>
                  <td>{people.find((p) => p.id === e.userId)?.name}</td>
                  <td>{e.role}</td>
                  <td>Não coletadas</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="print-section">
          <h2>Aprovações internas · Revisão {d.version}</h2>
          <p>Registros de decisão no aplicativo. Não constituem um PDF assinado eletronicamente.</p>
          <table>
            <thead>
              <tr>
                <th>Perfil</th>
                <th>Nome</th>
                <th>Decisão</th>
                <th>Data/hora</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((a) => (
                <tr key={a.id}>
                  <td>{a.profile}</td>
                  <td>{a.name}</td>
                  <td>{a.decision || 'Pendente'}</td>
                  <td>
                    {a.decided_at
                      ? new Date(a.decided_at).toLocaleString('pt-BR', {
                          timeZone: 'America/Sao_Paulo',
                        })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {photos.length > 0 && (
          <section className="print-section photo-annex">
            <h2>Anexo · Evidências de conclusão</h2>
            {photos.map((p) => (
              <figure key={p.id}>
                <img src={`/api/photos/${p.id}`} alt={p.caption} />
                <figcaption>
                  {p.caption}
                  <br />
                  {new Date(p.captured_at).toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                  })}{' '}
                  · {p.latitude}, {p.longitude} · Precisão {Math.round(p.accuracy)} m
                </figcaption>
              </figure>
            ))}
          </section>
        )}
        <footer className="print-foot">
          Nexus PTW AI · {d.company} / {d.unit} · {d.kind}-{d.number} · Revisão {d.version}
        </footer>
      </article>
    </div>
  );
}
