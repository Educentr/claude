// The transport, end to end, with a fake Codex on PATH — no model is called, nothing leaves the
// machine. Run: node --test plugins/agent-bus/test/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, '..', 'bin', 'agent-bus');
const HEAD = 'a'.repeat(40);

let tmp, bus, project, calls, env, server, serverB;

const run = (args, { input, as = 'claude-test', extraEnv = {} } = {}) =>
  spawnSync(process.execPath, [CLI, ...args], { input, encoding: 'utf8', env: { ...env, AGENT_BUS_NAME: as, ...extraEnv } });
const codexCalls = () => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

function serve(extra = [], cd = project) {
  const child = spawn(process.execPath, [CLI, 'serve-codex', '--cd', cd, ...extra], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  return new Promise((resolve, reject) => {
    child.stderr.on('data', (d) => { if (String(d).includes('serving')) resolve(child); });
    child.on('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bus-test-'));
  bus = path.join(tmp, 'bus');
  project = fs.realpathSync(fs.mkdtempSync(path.join(tmp, 'project-')));
  fs.mkdirSync(path.join(project, 'worktrees', 'one'), { recursive: true });
  calls = path.join(tmp, 'codex-calls.jsonl');
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  fs.symlinkSync(path.join(here, 'fake-codex'), path.join(bin, 'codex'));
  env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, AGENT_BUS_DIR: bus, FAKE_CODEX_CALLS: calls, AGENT_BUS_DEPTH: '0' };
  delete env.AGENT_BUS_REPORT_THREAD;
  server = await serve(['--exec-timeout', '3']);
  serverB = await serve(['--endpoint', 'codex-b', '--exec-timeout', '3']);
});

after(() => { server?.kill(); serverB?.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('the CLI starts where Node does not guess module types (Node 18 treats an extensionless file as CommonJS)', { skip: !process.allowedNodeEnvironmentFlags.has('--no-experimental-detect-module') && 'this Node has no such switch' }, () => {
  const r = spawnSync(process.execPath, ['--no-experimental-detect-module', CLI], { encoding: 'utf8', env });
  assert.doesNotMatch(r.stderr, /SyntaxError|Cannot use import/);
  assert.match(r.stderr, /usage: agent-bus/);
});

test('a question goes out, is claimed with a receipt, and the reply comes back to the asker', () => {
  const sent = run(['send', 'codex-live', 'What does the healer return for a closed row?']);
  const id = sent.stdout.trim();
  assert.match(id, /^\d+-[0-9a-f]{8}$/);
  const got = JSON.parse(run(['wait', 'codex-live', '--timeout', '5'], { as: 'codex-live' }).stdout);
  assert.deepEqual([got.version, got.type, got.from, got.reply_to, got.expects_reply, got.conversation_id], [1, 'question', 'claude-test', 'claude-test', true, id]);
  assert.match(run(['acked', id, '--timeout', '5']).stdout, /taken by codex-live/);
  run(['reply', id, 'The row status, unless the owner is alive.'], { as: 'codex-live' });
  assert.equal(run(['await', id, '--timeout', '5']).stdout, 'The row status, unless the owner is alive.\n');
});

test('a wait that times out says so and does not invent a message', () => {
  const r = run(['wait', 'nobody-writes-here', '--timeout', '1']);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
});

test('names are never paths: a recipient, a sender, a conversation or an id with a slash is refused', () => {
  for (const args of [['send', '../etc', 'x'], ['send', 'codex', 'x', '--conversation', 'a/b'], ['await', '../../replies/x'], ['wait', 'a b']]) {
    const r = run(args);
    assert.equal(r.status, 1, args.join(' '));
    assert.match(r.stderr, /must match/);
  }
  assert.match(run(['send', 'codex', 'x'], { as: 'bad/name' }).stderr, /sender/);
});

test('the mailbox is private: created 0700, and one that others can enter is refused', () => {
  assert.equal(fs.statSync(bus).mode & 0o777, 0o700);
  const open = path.join(tmp, 'open-bus');
  fs.mkdirSync(open, { mode: 0o755 });
  const r = run(['send', 'codex', 'x'], { extraEnv: { AGENT_BUS_DIR: open } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /open to other users/);
});

test('an oversize message is an error, never a silent cut', () => {
  const r = run(['send', 'codex', '-'], { input: 'x'.repeat(70 * 1024) });
  assert.equal(r.status, 5);
  assert.match(r.stderr, /the limit is 65536/);
});

test('a chain of replies stops at depth 3', () => {
  const r = run(['send', 'codex', 'again'], { extraEnv: { AGENT_BUS_DEPTH: '3' } });
  assert.equal(r.status, 3);
});

test('a review names its worktree, round and a FULL head — "HEAD" is not a revision', () => {
  assert.match(run(['ask', 'codex', 'look', '--type', 'review']).stderr, /needs --worktree, --head and --round/);
  assert.match(run(['ask', 'codex', 'look', '--type', 'review', '--worktree', project, '--round', '1', '--head', 'HEAD']).stderr, /full 40-character/);
});

test('the server runs Codex read-only in the review\'s worktree, under the policy, and resumes ONE thread per conversation', () => {
  const wt = path.join(project, 'worktrees', 'one');
  const review = (round, conv) => run(['ask', 'codex', `round ${round}`, '--type', 'review', '--worktree', wt, '--head', HEAD, '--round', String(round), '--conversation', conv, '--timeout', '20']);
  const first = review(1, 'ticket-1');
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, new RegExp(`^VERDICT: APPROVE\\nREVIEWED_HEAD: ${HEAD}`));
  assert.equal(review(2, 'ticket-1').status, 0);
  assert.equal(review(1, 'ticket-2').status, 0);

  const [c1, c2, c3] = codexCalls().slice(-3);
  assert.equal(c1.cwd, wt);
  assert.deepEqual(c1.args.slice(2, 6), ['-s', 'read-only', '-a', 'never']);
  assert.match(c1.prompt, /^# agent-bus policy: read-only reviewer/);
  assert.match(c1.prompt, /Review round 1 of 5\. Worktree: /);
  assert.ok(!c1.args.includes('resume'), 'the first round starts a thread');
  assert.ok(c2.args.includes('resume') && c2.args.includes('thread-codex'), 'the second round resumes the thread of the thread.started EVENT, not any line that mentions thread_id');
  assert.ok(!c3.args.includes('resume'), 'another conversation does not inherit the thread');
  // One output file per attempt: a requeued message must never be "answered" by an earlier attempt's file.
  assert.match(c1.args[c1.args.indexOf('-o') + 1], /\/\d+-[0-9a-f]{8}\.\d+\.\d+\.out$/);
});

test('a conversation belongs to one endpoint: the same id on another endpoint starts its own thread and its own count', () => {
  const wt = path.join(project, 'worktrees', 'one');
  const ask = (to) => run(['ask', to, 'shared id', '--type', 'review', '--worktree', wt, '--head', HEAD, '--round', '1', '--conversation', 'shared-ticket', '--timeout', '20']);
  assert.equal(ask('codex').status, 0);
  assert.equal(ask('codex-b').status, 0);
  const viaB = codexCalls().at(-1);
  assert.ok(!viaB.args.includes('resume'), 'endpoint B must not resume the thread endpoint A started');
  assert.equal(ask('codex-b').status, 0);
  assert.ok(codexCalls().at(-1).args.includes('thread-codex-b'));
});

test('a worktree outside the server\'s project root is refused without running anything', () => {
  const before = codexCalls().length;
  const r = run(['ask', 'codex', 'look', '--type', 'review', '--worktree', os.tmpdir(), '--head', HEAD, '--round', '1', '--timeout', '20']);
  assert.equal(r.status, 4);
  assert.match(r.stderr, /bad_worktree/);
  assert.equal(codexCalls().length, before);
});

test('the round limit belongs to the conversation — a round number typed by the author does not reset it', () => {
  const wt = path.join(project, 'worktrees', 'one');
  const review = (round) => run(['ask', 'codex', 'again', '--type', 'review', '--worktree', wt, '--head', HEAD, '--round', String(round), '--max-rounds', '2', '--conversation', 'ticket-limited', '--timeout', '20']);
  assert.equal(review(1).status, 0);
  assert.equal(review(2).status, 0);
  const third = review(1);
  assert.equal(third.status, 4);
  assert.match(third.stderr, /round_limit/);
  // …and the limit was fixed by the first review: asking for more rounds later does not buy them.
  const raised = run(['ask', 'codex', 'again', '--type', 'review', '--worktree', wt, '--head', HEAD, '--round', '1', '--max-rounds', '5', '--conversation', 'ticket-limited', '--timeout', '20']);
  assert.equal(raised.status, 4);
  assert.match(raised.stderr, /round_limit/);
});

test('round numbers are numbers: refused when sent, and refused again by the server for a hand-made envelope', () => {
  const wt = path.join(project, 'worktrees', 'one');
  assert.match(run(['send', 'codex', 'x', '--type', 'review', '--worktree', wt, '--head', HEAD, '--round', 'not-a-number']).stderr, /whole number from 1 to 99/);
  const overCap = run(['ask', 'codex', 'x', '--type', 'review', '--worktree', wt, '--head', HEAD, '--round', '1', '--max-rounds', '6', '--timeout', '20']);
  assert.equal(overCap.status, 4);
  assert.match(overCap.stderr, /bad_envelope.*over this server's limit of 5/);
  const id = `${Date.now()}-deadbeef`;
  fs.writeFileSync(path.join(bus, 'inbox', 'codex', `${id}.json`), JSON.stringify({ version: 1, id, type: 'review', from: 'claude-test', to: 'codex', text: 'x', worktree: wt, head: HEAD, round: null, max_rounds: 5 }));
  const handMade = run(['await', id, '--timeout', '20']);
  assert.equal(handMade.status, 4);
  assert.match(handMade.stderr, /bad_envelope.*whole numbers/);
});

test('only a delivered review uses a round — a run that failed does not', () => {
  const wt = path.join(project, 'worktrees', 'one');
  const review = (body) => run(['ask', 'codex', body, '--type', 'review', '--worktree', wt, '--head', HEAD, '--round', '1', '--max-rounds', '1', '--conversation', 'ticket-one-round', '--timeout', '20']);
  assert.match(review('PLEASE_FAIL').stderr, /exec_failed/);
  assert.equal(review('now for real').status, 0);
  assert.match(review('one more').stderr, /round_limit/);
});

test('a run that fails is a failure of the run (exit 4), not a short review', () => {
  const failed = run(['ask', 'codex', 'PLEASE_FAIL', '--timeout', '20']);
  assert.equal(failed.status, 4);
  assert.match(failed.stderr, /exec_failed.*codex exited 3/);
  const silent = run(['ask', 'codex', 'PLEASE_NO_FINAL', '--timeout', '20']);      // exit 0, but nothing was said
  assert.equal(silent.status, 4);
  assert.match(silent.stderr, /exec_failed.*with no final message/);
  const hung = run(['ask', 'codex', 'PLEASE_HANG', '--timeout', '30']);
  assert.equal(hung.status, 4);
  assert.match(hung.stderr, /exec_timeout/);
  const huge = run(['ask', 'codex', 'PLEASE_BE_HUGE', '--timeout', '20']);
  assert.equal(huge.status, 4);
  assert.match(huge.stderr, /reply_too_large.*oversize/);
});

test('status messages and --no-reply are information: nothing is run for them', () => {
  const before = codexCalls().length;
  run(['send', 'codex', 'pushed another commit', '--type', 'status']);
  run(['send', 'codex', 'fyi', '--no-reply']);
  assert.equal(run(['ask', 'codex', 'now a real question', '--timeout', '20']).status, 0);   // queued behind them
  assert.equal(codexCalls().length, before + 1);
});

test('one server per endpoint: a second one on the same endpoint exits with the reason', () => {
  const r = run(['serve-codex', '--cd', project]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already served by pid/);
});

test('recover lists what was claimed and never answered, and puts one back only when told to', () => {
  const id = run(['send', 'codex-crashed', 'half done?']).stdout.trim();
  run(['wait', 'codex-crashed', '--timeout', '5'], { as: 'codex-crashed' });          // claimed, then the agent died
  assert.match(run(['recover', 'codex-crashed']).stdout, new RegExp(`^${id}\\tquestion\\tfrom claude-test`));
  assert.match(run(['recover', 'codex-crashed', '--requeue', id]).stdout, /requeued/);
  assert.equal(JSON.parse(run(['wait', 'codex-crashed', '--timeout', '5'], { as: 'codex-crashed' }).stdout).id, id);
});
