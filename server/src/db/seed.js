// Seed enabled school services and fictitious profiles so the system is usable
// immediately. Run with: npm run seed
import { db, migrate, log } from './index.js';

migrate();

const services = [
  ['Declaração de matrícula', 'declaracao', 'Comprovação de matrícula ativa.'],
  ['Declaração de frequência', 'declaracao', 'Comprovação de frequência escolar.'],
  ['Histórico escolar', 'historico', 'Histórico com notas e disciplinas.'],
  ['Segunda via de histórico', 'historico', 'Reemissão de histórico escolar.'],
  ['Segunda via de documento', 'documento', 'Reemissão de documento escolar.'],
  ['Esclarecimento sobre calendário', 'esclarecimento', 'Dúvidas sobre o calendário.'],
];

const profiles = [
  ['Maria Fictícia', 'responsavel', 'Responsável simulado(a) para teste.'],
  ['João Simulado', 'responsavel', 'Responsável simulado(a) para teste.'],
  ['Prof. Teste', 'professor', 'Docente simulado(a) para teste.'],
  ['Coord. Exemplo', 'coordenador', 'Coordenação simulada para teste.'],
  ['Func. Demonstração', 'funcionario', 'Funcionário(a) simulado(a) para teste.'],
];

const svcCount = db.prepare('SELECT COUNT(*) AS c FROM services').get().c;
if (svcCount === 0) {
  const stmt = db.prepare('INSERT INTO services (name, category, description, enabled) VALUES (?, ?, ?, 1)');
  services.forEach((s) => stmt.run(...s));
  console.log(`Inseridos ${services.length} serviços.`);
}

const profCount = db.prepare('SELECT COUNT(*) AS c FROM profiles').get().c;
if (profCount === 0) {
  const stmt = db.prepare('INSERT INTO profiles (name, role, context, fictitious, enabled) VALUES (?, ?, ?, 1, 1)');
  profiles.forEach((p) => stmt.run(...p));
  console.log(`Inseridos ${profiles.length} perfis fictícios.`);
}

log('info', 'ai', 'Seed executado.');
console.log('Seed concluído.');
process.exit(0);
