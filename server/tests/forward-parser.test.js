// Testa o parser de e-mails encaminhados com formatos reais de Outlook e Gmail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseForwarded, stripForwardPrefixes, looksForwarded } from '../src/services/forwardParser.js';

test('stripForwardPrefixes remove Fwd:/Enc:/Re: repetidos', () => {
  assert.equal(stripForwardPrefixes('Fwd: Enc: Declaração'), 'Declaração');
  assert.equal(stripForwardPrefixes('RE: Re: Dúvida'), 'Dúvida');
  assert.equal(stripForwardPrefixes('Histórico escolar'), 'Histórico escolar');
});

test('looksForwarded detecta encaminhamento por assunto e por corpo', () => {
  assert.equal(looksForwarded('Fwd: algo', ''), true);
  assert.equal(looksForwarded('Enc: algo', ''), true);
  assert.equal(looksForwarded('algo', '---------- Mensagem encaminhada ----------\nDe: x'), true);
  assert.equal(looksForwarded('assunto normal', 'corpo normal'), false);
});

test('Formato Outlook (pt-BR): extrai remetente/assunto/data originais', () => {
  const body = [
    'Encaminhando a solicitação abaixo.',
    '',
    'De: Maria Santos <maria.santos@exemplo.com>',
    'Enviada em: terça-feira, 13 de outubro de 2026 09:14',
    'Para: Atendimento <admsedugestao@outlook.com>',
    'Assunto: Declaração de matrícula',
    '',
    'Bom dia, gostaria de solicitar a declaração de matrícula do meu filho.',
    'Atenciosamente, Maria.',
  ].join('\n');
  const r = parseForwarded({ subject: 'Enc: Declaração de matrícula', body });
  assert.ok(r);
  assert.equal(r.originalFromEmail, 'maria.santos@exemplo.com');
  assert.equal(r.originalName, 'Maria Santos');
  assert.equal(r.originalSubject, 'Declaração de matrícula');
  assert.match(r.originalBody, /declaração de matrícula do meu filho/i);
  assert.ok(!/Para:/.test(r.originalBody)); // cabeçalho não entra no corpo
});

test('Formato Gmail (en): bloco "Forwarded message"', () => {
  const body = [
    '---------- Forwarded message ---------',
    'From: João Pereira <joao@exemplo.com>',
    'Date: Mon, 13 Oct 2026 at 10:02',
    'Subject: Histórico escolar',
    'To: <admsedugestao@outlook.com>',
    '',
    'Preciso do histórico escolar para transferência.',
  ].join('\n');
  const r = parseForwarded({ subject: 'Fwd: Histórico escolar', body });
  assert.ok(r);
  assert.equal(r.originalFromEmail, 'joao@exemplo.com');
  assert.equal(r.originalName, 'João Pereira');
  assert.equal(r.originalSubject, 'Histórico escolar');
  assert.match(r.originalBody, /transferência/i);
});

test('Não encaminhado: retorna null', () => {
  const r = parseForwarded({ subject: 'Dúvida sobre horário', body: 'Qual o horário da secretaria?' });
  assert.equal(r, null);
});

test('Encaminhado sem bloco reconhecível: retorna null (chamador usa fallback)', () => {
  const r = parseForwarded({ subject: 'Fwd: algo', body: 'sem cabeçalho de origem aqui' });
  assert.equal(r, null);
});
