// EduGestão: importação idempotente de alunos/responsáveis, catálogo de
// processos escolares e assinaturas institucionais.
import { db, getSettings, log } from '../db/index.js';
import { STUDENT_PAIRS } from '../data/students.js';

/**
 * Importa os pares aluno—responsável de forma IDEMPOTENTE.
 * - Responsável: único por nome (reutiliza se já existe).
 * - Aluno: único por nome; atualiza o vínculo com o responsável se mudou.
 * Retorna um resumo { guardiansInserted, studentsInserted, studentsUpdated, unchanged, conflicts }.
 */
export function importStudents(pairs = STUDENT_PAIRS) {
  const upsertGuardian = db.prepare(
    `INSERT INTO guardians (name) VALUES (?)
     ON CONFLICT(name) DO NOTHING`,
  );
  const getGuardian = db.prepare('SELECT id FROM guardians WHERE name = ?');
  const getStudent = db.prepare('SELECT id, guardian_id FROM students WHERE name = ?');
  const insertStudent = db.prepare(
    'INSERT INTO students (name, guardian_id) VALUES (?, ?)',
  );
  const updateStudent = db.prepare(
    "UPDATE students SET guardian_id = ? WHERE id = ?",
  );

  const summary = {
    total: pairs.length,
    guardiansInserted: 0,
    studentsInserted: 0,
    studentsUpdated: 0,
    unchanged: 0,
    conflicts: [],
  };

  const tx = db.transaction(() => {
    for (const [studentName, guardianName] of pairs) {
      if (!studentName || !guardianName) {
        summary.conflicts.push({ studentName, reason: 'par incompleto' });
        continue;
      }
      // Guardian (idempotente)
      const beforeG = getGuardian.get(guardianName);
      const info = upsertGuardian.run(guardianName);
      if (!beforeG && info.changes > 0) summary.guardiansInserted++;
      const guardian = getGuardian.get(guardianName);

      // Student (idempotente)
      const existing = getStudent.get(studentName);
      if (!existing) {
        insertStudent.run(studentName, guardian.id);
        summary.studentsInserted++;
      } else if (existing.guardian_id !== guardian.id) {
        updateStudent.run(guardian.id, existing.id);
        summary.studentsUpdated++;
      } else {
        summary.unchanged++;
      }
    }
  });
  tx();

  log('info', 'edugestao',
    `Importação de alunos: +${summary.studentsInserted} novos, ${summary.studentsUpdated} atualizados, ${summary.unchanged} inalterados.`);
  return summary;
}

export function listStudents() {
  return db
    .prepare(
      `SELECT s.id, s.name, s.enrollment, g.name AS guardian_name, g.email AS guardian_email
       FROM students s LEFT JOIN guardians g ON g.id = s.guardian_id
       ORDER BY s.name ASC`,
    )
    .all();
}

export function studentsCount() {
  return {
    students: db.prepare('SELECT COUNT(*) AS c FROM students').get().c,
    guardians: db.prepare('SELECT COUNT(*) AS c FROM guardians').get().c,
  };
}

// --- Catálogo de processos escolares (modelos internos) ---------------------
const PROCESS_TEMPLATES = [
  ['declaracao_matricula', 'Declaração de matrícula', 'declaracao', 'Comprovação de matrícula ativa.', 'Nome do aluno e vínculo.', 'Verificação cadastral; emissão; envio.', 'Secretaria Escolar', 3, 'A declaração de matrícula será providenciada pela Secretaria.', 'Documento disponibilizado ao solicitante.'],
  ['declaracao_frequencia', 'Declaração de frequência', 'declaracao', 'Comprovação de frequência escolar.', 'Nome do aluno e período.', 'Verificação de frequência; emissão; envio.', 'Secretaria Escolar', 3, 'A declaração de frequência será providenciada pela Secretaria.', 'Documento disponibilizado ao solicitante.'],
  ['historico_escolar', 'Histórico escolar', 'historico', 'Histórico com notas e disciplinas.', 'Nome do aluno; motivo.', 'Conferência de notas; emissão; envio.', 'Secretaria Escolar', 7, 'O histórico escolar será preparado pela Secretaria.', 'Histórico disponibilizado ao solicitante.'],
  ['boletim', 'Boletim', 'documento', 'Boletim de notas do período.', 'Nome do aluno; período letivo.', 'Consolidação de notas; emissão; envio.', 'Secretaria Escolar', 3, 'O boletim do período será disponibilizado.', 'Boletim entregue ao solicitante.'],
  ['correcao_cadastral', 'Correção cadastral', 'cadastro', 'Correção de dados cadastrais.', 'Dado a corrigir e valor correto.', 'Validação; atualização cadastral; confirmação.', 'Secretaria Escolar', 2, 'A correção cadastral será avaliada pela Secretaria.', 'Cadastro atualizado e confirmado.'],
  ['atualizacao_contatos', 'Atualização de contatos', 'cadastro', 'Atualização de telefone/e-mail do responsável.', 'Novos contatos.', 'Validação; atualização; confirmação.', 'Secretaria Escolar', 2, 'Os contatos serão atualizados após validação.', 'Contatos atualizados.'],
  ['transferencia', 'Transferência', 'transferencia', 'Processo de transferência escolar.', 'Motivo; escola de destino.', 'Análise; documentação; encaminhamento.', 'Secretaria Escolar', 10, 'O pedido de transferência será analisado pela Secretaria.', 'Processo de transferência encaminhado.'],
  ['calendario_horarios', 'Informações sobre calendário e horários', 'esclarecimento', 'Dúvidas sobre calendário/horários.', 'Dúvida específica.', 'Consulta ao calendário; resposta.', 'Atendimento Escolar', 1, 'Seguem as informações sobre calendário e horários.', 'Dúvida esclarecida.'],
  ['duvidas_avaliacoes', 'Dúvidas sobre avaliações', 'esclarecimento', 'Dúvidas sobre avaliações.', 'Disciplina; dúvida.', 'Encaminhamento à coordenação se necessário; resposta.', 'Coordenação', 2, 'A dúvida sobre avaliações será respondida.', 'Dúvida esclarecida.'],
  ['solicitacao_documental', 'Solicitações documentais', 'documento', 'Pedido de documentos diversos.', 'Documento desejado.', 'Verificação; emissão; envio.', 'Secretaria Escolar', 5, 'A solicitação documental será avaliada.', 'Documento disponibilizado.'],
  ['encaminhamento_secretaria', 'Encaminhamento à secretaria', 'encaminhamento', 'Encaminhamento de caso à secretaria.', 'Descrição do caso.', 'Triagem; encaminhamento.', 'Secretaria Escolar', 2, 'Seu caso foi encaminhado à Secretaria.', 'Caso encaminhado.'],
  ['encaminhamento_coordenacao', 'Encaminhamento à coordenação', 'encaminhamento', 'Encaminhamento de caso à coordenação.', 'Descrição do caso.', 'Triagem; encaminhamento.', 'Coordenação', 2, 'Seu caso foi encaminhado à Coordenação.', 'Caso encaminhado.'],
];

export function seedProcesses() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM processes').get().c;
  if (count > 0) return { seeded: 0 };
  const stmt = db.prepare(
    `INSERT INTO processes
      (code, name, category, description, requirements, steps, responsible_sector,
       sla_days, response_template, completion_criteria, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  );
  const tx = db.transaction(() => PROCESS_TEMPLATES.forEach((p) => stmt.run(...p)));
  tx();
  return { seeded: PROCESS_TEMPLATES.length };
}

export function listProcesses() {
  return db.prepare('SELECT * FROM processes ORDER BY name ASC').all();
}

// --- Assinaturas institucionais --------------------------------------------
export function seedSignatures() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM signatures').get().c;
  if (count > 0) return { seeded: 0 };
  const settings = getSettings();
  const email = settings.institution_email || 'adminedugestao@gmail.com';
  const inst = settings.institution_name || 'EduGestão';
  const mk = (display, sectorLabel) =>
    `${display}\n${sectorLabel}\nE-mail: ${email}\n${inst} — Gestão e Atendimento Escolar`;

  const rows = [
    ['atendimento', 'Atendimento Escolar', mk('Atendimento Escolar', 'Setor de Atendimento Escolar'), 1],
    ['secretaria', 'Secretaria Escolar', mk('Secretaria Escolar', 'Setor de Secretaria Escolar'), 0],
    ['coordenacao', 'Coordenação', mk('Coordenação', 'Setor de Coordenação Pedagógica'), 0],
    ['direcao', 'Direção', mk('Direção', 'Direção'), 0],
  ];
  const stmt = db.prepare(
    'INSERT INTO signatures (sector, display_name, body, is_default, enabled) VALUES (?, ?, ?, ?, 1)',
  );
  const tx = db.transaction(() => rows.forEach((r) => stmt.run(...r)));
  tx();
  return { seeded: rows.length };
}

export function listSignatures() {
  return db.prepare('SELECT * FROM signatures ORDER BY is_default DESC, sector ASC').all();
}

export function getDefaultSignature() {
  return (
    db.prepare('SELECT * FROM signatures WHERE is_default = 1 AND enabled = 1 LIMIT 1').get() ||
    db.prepare('SELECT * FROM signatures WHERE enabled = 1 LIMIT 1').get() ||
    null
  );
}

/**
 * Acrescenta a assinatura ao corpo, SEM duplicar (se o corpo já contém a
 * assinatura, retorna inalterado).
 */
export function applySignature(body, sector) {
  const sig = sector
    ? db.prepare('SELECT * FROM signatures WHERE sector = ? AND enabled = 1').get(sector)
    : getDefaultSignature();
  if (!sig) return body;
  if (body && body.includes(sig.body)) return body; // evita duplicação
  return `${body}\n\n${sig.body}`;
}

export function seedAll() {
  seedProcesses();
  seedSignatures();
}
