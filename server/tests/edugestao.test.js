// Testes do módulo EduGestão: importação idempotente dos 61 pares, catálogo de
// processos, assinaturas institucionais (aplicação sem duplicar).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DB = path.resolve('./data/test-edu.db');
process.env.DATABASE_FILE = './data/test-edu.db';
process.env.GOOGLE_CLIENT_ID = '';
process.env.GOOGLE_CLIENT_SECRET = '';
for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
  if (fs.existsSync(f)) fs.rmSync(f);
}

const { db, migrate } = await import('../src/db/index.js');
migrate();

const { STUDENT_PAIRS } = await import('../src/data/students.js');
const edu = await import('../src/services/edugestao.js');

test('Dados: exatamente 61 pares aluno—responsável', () => {
  assert.equal(STUDENT_PAIRS.length, 61);
});

test('Import: primeira importação insere alunos e responsáveis', () => {
  const s = edu.importStudents();
  assert.equal(s.studentsInserted, 61);
  assert.ok(s.guardiansInserted > 0);
  const c = edu.studentsCount();
  assert.equal(c.students, 61);
});

test('Import: é idempotente (reexecutar não duplica)', () => {
  const s = edu.importStudents();
  assert.equal(s.studentsInserted, 0);
  assert.equal(s.studentsUpdated, 0);
  assert.equal(s.unchanged, 61);
  const c = edu.studentsCount();
  assert.equal(c.students, 61);
});

test('Import: responsável compartilhado é reutilizado (ex.: Fernando Rodrigues)', () => {
  // Eduardo Pereira Rodrigues, Priscila Pereira Rodrigues e Yasmin Pereira
  // Rodrigues compartilham o responsável "Fernando Rodrigues".
  const g = db.prepare("SELECT id FROM guardians WHERE name = 'Fernando Rodrigues'").get();
  assert.ok(g);
  const n = db.prepare('SELECT COUNT(*) AS c FROM students WHERE guardian_id = ?').get(g.id).c;
  assert.equal(n, 3);
  // Grafia preservada (acentos).
  const acc = db.prepare("SELECT id FROM students WHERE name = 'Gabryella de Jesus Santos'").get();
  assert.ok(acc);
});

test('Import: vínculo é atualizado se o responsável mudar (idempotência de update)', () => {
  // Cria um responsável alternativo e troca o vínculo de um aluno; reimportar restaura.
  db.prepare("INSERT INTO guardians (name) VALUES ('Outro Responsável')").run();
  const other = db.prepare("SELECT id FROM guardians WHERE name='Outro Responsável'").get();
  db.prepare("UPDATE students SET guardian_id=? WHERE name='Ana Clara Souza Silva'").run(other.id);
  const s = edu.importStudents();
  assert.ok(s.studentsUpdated >= 1);
  const g = db.prepare("SELECT guardian_id FROM students WHERE name='Ana Clara Souza Silva'").get();
  const carlos = db.prepare("SELECT id FROM guardians WHERE name='Carlos Silva'").get();
  assert.equal(g.guardian_id, carlos.id);
});

test('Processos: seed cria o catálogo e é idempotente', () => {
  const first = edu.seedProcesses();
  assert.ok(first.seeded >= 10);
  const again = edu.seedProcesses();
  assert.equal(again.seeded, 0);
  const list = edu.listProcesses();
  assert.ok(list.find((p) => p.code === 'declaracao_matricula'));
});

test('Assinaturas: seed cria assinaturas EduGestão com e-mail institucional', () => {
  edu.seedSignatures();
  const list = edu.listSignatures();
  const atendimento = list.find((s) => s.sector === 'atendimento');
  assert.ok(atendimento);
  assert.equal(atendimento.is_default, 1);
  assert.match(atendimento.body, /adminedugestao@gmail\.com/);
  assert.match(atendimento.body, /EduGestão/);
});

test('Assinatura: aplicada ao corpo e sem duplicar quando reaplicada', () => {
  const once = edu.applySignature('Olá, segue a resposta.', 'atendimento');
  assert.match(once, /Atendimento Escolar/);
  const twice = edu.applySignature(once, 'atendimento');
  // Não deve haver duas assinaturas (idempotente).
  const occurrences = (twice.match(/EduGestão — Gestão e Atendimento Escolar/g) || []).length;
  assert.equal(occurrences, 1);
});

const gen = await import('../src/ai/generator.js');

test('Modo profissional: solicitação sem marcadores de simulação', () => {
  const service = { name: 'Declaração de matrícula', category: 'declaracao' };
  const profile = { name: 'Maria Santos', role: 'responsavel' };
  // Modo real
  const real = gen.generateRequestContent({ service, profile, seed: 7, realMode: true });
  assert.ok(!real.subject.includes('[SIMULAÇÃO]'));
  assert.doesNotMatch(real.body, /perfil fictício|simulação|fins de teste/i);
  assert.equal(real.fictitious, false);
  // Modo simulação (padrão) mantém o marcador
  const sim = gen.generateRequestContent({ service, profile, seed: 7, realMode: false });
  assert.ok(sim.subject.includes('[SIMULAÇÃO]'));
  assert.match(sim.body, /simulação/i);
  assert.equal(sim.fictitious, true);
});

test('Modo profissional: acompanhamento sem rodapé de simulação', () => {
  const request = { public_id: 'SIM-2026-0001', subject: 'Declaração de matrícula', category: 'declaracao', profile_name: 'Maria Santos' };
  const real = gen.generateFollowUp({ request, lastInbound: { body: 'ok' }, realMode: true });
  assert.doesNotMatch(real.body, /perfil fictício|Acompanhamento fictício|simulação/i);
  assert.equal(real.fictitious, false);
});
