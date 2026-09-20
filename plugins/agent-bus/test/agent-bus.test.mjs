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

let tmp, bus, project, calls, queued, codexHome, env, server, serverB;

const run = (args, { input, as = 'claude-test', extraEnv = {} } = {}) =>
  spawnSync(process.execPath, [CLI, ...args], { input, encoding: 'utf8', env: { ...env, AGENT_BUS_NAME: as, ...extraEnv } });
const ls = (...p) => { try { return fs.readdirSync(path.join(bus, ...p)); } catch { return []; } };
const queuedMessages = () => (fs.existsSync(queued) ? fs.readFileSync(queued, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const codexCalls = () => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

function serve(extra = [], cd = project, extraEnv = {}) {
  const child = spawn(process.execPath, [CLI, 'serve-codex', '--cd', cd, ...extra], { env: { ...env, ...extraEnv }, stdio: ['ignore', 'ignore', 'pipe'] });
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
  queued = path.join(tmp, 'codex-queue.jsonl');
  codexHome = fs.realpathSync(fs.mkdtempSync(path.join(tmp, 'codex-home-')));
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  fs.symlinkSync(path.join(here, 'fake-codex'), path.join(bin, 'codex'));
  env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, AGENT_BUS_DIR: bus, CODEX_HOME: codexHome, FAKE_CODEX_CALLS: calls, FAKE_CODEX_QUEUE: queued, AGENT_BUS_DEPTH: '0' };
  delete env.AGENT_BUS_REPORT_THREAD;
  server = await serve(['--exec-timeout', '3']);
  serverB = await serve(['--endpoint', 'codex-b', '--exec-timeout', '3']);
});

const stop = (child) => new Promise((resolve) => { if (!child || child.exitCode !== null) return resolve(); child.on('exit', resolve); child.kill(); });

after(async () => { await stop(server); await stop(serverB); fs.rmSync(tmp, { recursive: true, force: true }); });

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
  assert.match(c1.prompt, /^# agent-bus policy: peer/);
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

test('a limit stored under a more generous server does not outlive it: the cap is the one in force now', async () => {
  const wt = path.join(project, 'worktrees', 'one');
  const review = (to, max) => run(['ask', to, 'again', '--type', 'review', '--worktree', wt, '--head', HEAD, '--round', '1', '--max-rounds', String(max), '--conversation', 'ticket-generous', '--timeout', '20']);
  const generous = await serve(['--endpoint', 'codex-cap', '--max-rounds', '10', '--exec-timeout', '3']);
  assert.equal(review('codex-cap', 10).status, 0);
  assert.equal(review('codex-cap', 10).status, 0);
  await stop(generous);
  assert.ok(!fs.existsSync(path.join(bus, 'locks', 'codex-cap.pid')), 'a server that is told to stop releases its endpoint');
  const strict = await serve(['--endpoint', 'codex-cap', '--max-rounds', '2', '--exec-timeout', '3']);
  try {
    const third = review('codex-cap', 2);                 // a valid envelope for the new server — and the third review
    assert.equal(third.status, 4);
    assert.match(third.stderr, /round_limit.*has used its 2 review rounds/);
  } finally { await stop(strict); }
});

test('an answer too large to deliver is a failed run: it does not use the round, and the retry gets through', () => {
  const wt = path.join(project, 'worktrees', 'one');
  const review = (body) => run(['ask', 'codex', body, '--type', 'review', '--worktree', wt, '--head', HEAD, '--round', '1', '--max-rounds', '1', '--conversation', 'ticket-huge', '--timeout', '20']);
  assert.match(review('PLEASE_BE_HUGE').stderr, /reply_too_large/);
  assert.equal(review('shorter this time').status, 0);
  assert.match(review('one more').stderr, /round_limit/);
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
  assert.match(run(['unlock', 'codex']).stderr, /is running — stop that server instead/);
});

test('a lock left by a dead server is never taken over silently — it is removed by an explicit unlock', () => {
  const dead = spawnSync(process.execPath, ['-e', '']).pid;          // has exited by now
  fs.writeFileSync(path.join(bus, 'locks', 'codex-stale.pid'), String(dead));
  const r = run(['serve-codex', '--cd', project, '--endpoint', 'codex-stale']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /left by pid \d+, which is not running.*agent-bus unlock codex-stale/);
  assert.match(run(['unlock', 'codex-stale']).stdout, /removed the lock/);
  assert.match(run(['unlock', 'codex-stale']).stdout, /is not locked/);
});

test('install copies the plugin to a stable place, links the CLI and the Codex skill to it, and the installed CLI works', () => {
  const dirs = { AGENT_BUS_HOME: path.join(tmp, 'share', 'agent-bus'), AGENT_BUS_BIN_DIR: path.join(tmp, 'home-bin'), AGENT_BUS_CODEX_SKILLS_DIR: path.join(tmp, 'skills'), CODEX_HOME: path.join(tmp, 'codex-home') };
  const install = (...args) => run(['install', ...args], { extraEnv: dirs });
  const first = install();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /copied  agent-bus \d+\.\d+\.\d+ -> /);
  const cli = path.join(dirs.AGENT_BUS_BIN_DIR, 'agent-bus');
  assert.equal(fs.readlinkSync(cli), path.join(dirs.AGENT_BUS_HOME, 'bin', 'agent-bus'));
  assert.equal(fs.readlinkSync(path.join(dirs.AGENT_BUS_CODEX_SKILLS_DIR, 'agent-bus')), path.join(dirs.AGENT_BUS_HOME, 'codex', 'skills', 'agent-bus'));
  // The copy is self-sufficient: the installed CLI finds ITS policy, not the source's.
  const doctor = spawnSync(process.execPath, [cli, 'doctor'], { encoding: 'utf8', env: { ...env, ...dirs } });
  assert.ok(doctor.stdout.includes(`ok   policy ${path.join(fs.realpathSync(dirs.AGENT_BUS_HOME), 'policies', 'peer.md')}`), doctor.stdout);
  assert.equal(install().status, 0, 'running it again updates the copy');
  // …but the installed copy cannot install itself over itself,
  assert.match(spawnSync(process.execPath, [cli, 'install'], { encoding: 'utf8', env: { ...env, ...dirs } }).stderr, /this is the installed copy/);
  // and a directory somebody else made is never replaced.
  const foreign = path.join(tmp, 'somebody-elses');
  fs.mkdirSync(foreign);
  assert.match(run(['install'], { extraEnv: { ...dirs, AGENT_BUS_HOME: foreign } }).stderr, /was not made by agent-bus install/);

  // The AGENTS.md block: only on request, and only once — above it the user's own text stays.
  fs.mkdirSync(dirs.CODEX_HOME);
  fs.writeFileSync(path.join(dirs.CODEX_HOME, 'AGENTS.md'), '# mine\n');
  assert.match(install('--agents-md').stdout, /added   the \[agent-bus\] block/);
  assert.match(install('--agents-md').stdout, /kept .* already there/);
  const agents = fs.readFileSync(path.join(dirs.CODEX_HOME, 'AGENTS.md'), 'utf8');
  assert.ok(agents.startsWith('# mine\n') && agents.split('## Messages marked [agent-bus]').length === 2);

  // Uninstall removes what install made — and nothing that is somebody's own file.
  const removed = install('--uninstall');
  assert.match(removed.stdout, /removed .*home-bin\/agent-bus/);
  assert.ok(!fs.existsSync(dirs.AGENT_BUS_HOME) && !fs.existsSync(cli));
  fs.writeFileSync(cli, 'my own script');
  assert.match(install().stdout, /SKIPPED .* a regular file is already there/);
  install('--uninstall');
  assert.equal(fs.readFileSync(cli, 'utf8'), 'my own script');
});

test('install --link points straight at the source, for a clone that git pull keeps current', () => {
  const dirs = { AGENT_BUS_HOME: path.join(tmp, 'share-link'), AGENT_BUS_BIN_DIR: path.join(tmp, 'link-bin'), AGENT_BUS_CODEX_SKILLS_DIR: path.join(tmp, 'link-skills') };
  assert.equal(run(['install', '--link'], { extraEnv: dirs }).status, 0);
  assert.equal(fs.readlinkSync(path.join(dirs.AGENT_BUS_BIN_DIR, 'agent-bus')), fs.realpathSync(CLI));
  assert.ok(!fs.existsSync(dirs.AGENT_BUS_HOME), 'nothing is copied in link mode');
  run(['install', '--link', '--uninstall'], { extraEnv: dirs });
  assert.ok(!fs.existsSync(path.join(dirs.AGENT_BUS_BIN_DIR, 'agent-bus')));
});

test('serve-codex --detach returns once the endpoint is held, the server answers, and stop releases the endpoint', () => {
  const started = run(['serve-codex', '--cd', project, '--endpoint', 'codex-detached', '--detach', '--exec-timeout', '3']);
  assert.equal(started.status, 0, started.stderr);
  const pid = Number(started.stdout.match(/as pid (\d+)/)[1]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(bus, 'locks', 'codex-detached.pid'), 'utf8')).pid, pid);
  assert.equal(run(['ask', 'codex-detached', 'anyone there?', '--timeout', '20']).status, 0);
  assert.match(run(['serve-codex', '--cd', project, '--endpoint', 'codex-detached', '--detach']).stderr, /did not start[\s\S]*already served by pid/);
  assert.match(run(['stop', 'codex-detached', '--timeout', '20']).stdout, /stopped the server of "codex-detached"/);
  assert.ok(!fs.existsSync(path.join(bus, 'locks', 'codex-detached.pid')));
  assert.match(run(['stop', 'codex-detached']).stdout, /is not served/);
});

test('stop never signals a process it cannot prove is that server: an empty lock, pid 0, or a pid that is somebody else\'s now', async () => {
  const lock = (me) => path.join(bus, 'locks', `${me}.pid`);
  // Between creating a lock and writing it an old server left an empty file; Number('') is 0 — the caller's whole process group.
  for (const [me, body] of [['codex-empty', ''], ['codex-zero', '0'], ['codex-init', JSON.stringify({ pid: 1, started: null })]]) {
    fs.writeFileSync(lock(me), body);
    const r = run(['stop', me]);
    assert.equal(r.status, 1, me);
    assert.match(r.stderr, /does not hold a pid — nothing was signalled/);
  }
  // A lock left by a crash whose pid now belongs to an unrelated, living process.
  const bystander = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  try {
    fs.writeFileSync(lock('codex-reused'), String(bystander.pid));
    const r = run(['stop', 'codex-reused']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /not running that server any more — nothing was signalled/);
    assert.equal(bystander.exitCode, null, 'the bystander must still be running');
    assert.doesNotThrow(() => process.kill(bystander.pid, 0));
    // …and a REAL server under that pid but from another launch is not "that server" either.
    fs.writeFileSync(lock('codex-relaunched'), JSON.stringify({ pid: server.pid, started: 'Thu Jan  1 00:00:00 1970' }));
    assert.match(run(['stop', 'codex-relaunched']).stderr, /nothing was signalled/);
    assert.equal(server.exitCode, null);
    assert.match(run(['unlock', 'codex-reused']).stdout, /removed the lock/);
  } finally { bystander.kill('SIGKILL'); }
});

test('a check that FAILED is not "the server is gone": no signal and no unlock on an old-format lock, a deaf ps, or another time zone', async () => {
  const lock = (me) => path.join(bus, 'locks', `${me}.pid`);
  // 1. A lock written by 1.0 (a bare pid) whose pid now belongs to the listener of ANOTHER endpoint.
  fs.writeFileSync(lock('codex-legacy'), String(serverB.pid));
  for (const cmd of ['stop', 'unlock']) {
    const r = run([cmd, 'codex-legacy']);
    assert.equal(r.status, 1, cmd);
    assert.match(r.stderr, /could not be verified .* nothing was signalled or removed/);
  }
  assert.equal(serverB.exitCode, null, 'the other endpoint\'s listener is still running');
  assert.ok(fs.existsSync(lock('codex-legacy')));
  fs.unlinkSync(lock('codex-legacy'));

  // 2. ps cannot be run at all, and the owner is alive: the real lock of a real server stays.
  const deafPs = { PATH: path.join(tmp, 'no-such-dir') };
  for (const cmd of ['stop', 'unlock']) {
    const r = run([cmd, 'codex-b'], { extraEnv: deafPs });
    assert.equal(r.status, 1, cmd);
    assert.match(r.stderr, /could not be verified/);
  }
  assert.equal(serverB.exitCode, null);
  assert.equal(JSON.parse(fs.readFileSync(lock('codex-b'), 'utf8')).pid, serverB.pid);
  // …and --force is for a file that is not a lock, never a way round one that is.
  assert.match(run(['unlock', 'codex-b', '--force'], { extraEnv: deafPs }).stderr, /could not be verified/);

  // 2b. A ps that IS there but exits 1 with a complaint — "no such process" for one ps, "illegal
  //     option" for another. Its silence proves nothing about a process that kill(0) can see.
  const grumpy = path.join(tmp, 'grumpy-ps');
  fs.mkdirSync(grumpy);
  fs.writeFileSync(path.join(grumpy, 'ps'), '#!/bin/sh\necho "ps: illegal option -- o" >&2\nexit 1\n', { mode: 0o755 });
  const grumpyPs = { PATH: `${grumpy}:${process.env.PATH}` };
  for (const args of [['stop', 'codex-b'], ['unlock', 'codex-b'], ['unlock', 'codex-b', '--force']]) {
    const r = run(args, { extraEnv: grumpyPs });
    assert.equal(r.status, 1, args.join(' '));
    assert.match(r.stderr, /could not be verified/, args.join(' '));
  }
  assert.equal(serverB.exitCode, null);
  assert.equal(JSON.parse(fs.readFileSync(lock('codex-b'), 'utf8')).pid, serverB.pid);
  assert.match(run(['unlock', 'codex-b', '--force']).stderr, /is running — stop that server instead/);

  // 3. Started under one time zone and locale, stopped under another: still the same launch.
  const abroad = await serve(['--endpoint', 'codex-tz', '--exec-timeout', '3'], project, { TZ: 'America/New_York', LC_ALL: 'C' });
  const stopped = run(['stop', 'codex-tz', '--timeout', '20'], { extraEnv: { TZ: 'Asia/Tokyo', LC_ALL: 'ru_RU.UTF-8' } });
  await stop(abroad);
  assert.match(stopped.stdout, /stopped the server of "codex-tz"/);
  assert.ok(!fs.existsSync(lock('codex-tz')));
});

test('uninstall removes only the links install makes — not any link that happens to point under a wide AGENT_BUS_HOME', () => {
  const wide = path.join(tmp, 'wide-home');                       // think AGENT_BUS_HOME=$HOME
  const dirs = { AGENT_BUS_HOME: wide, AGENT_BUS_BIN_DIR: path.join(tmp, 'wide-bin'), AGENT_BUS_CODEX_SKILLS_DIR: path.join(tmp, 'wide-skills') };
  fs.mkdirSync(path.join(wide, 'my-tools'), { recursive: true });
  fs.writeFileSync(path.join(wide, 'my-tools', 'custom-bus'), '#!/bin/sh\n');
  fs.mkdirSync(dirs.AGENT_BUS_BIN_DIR);
  const mine = path.join(dirs.AGENT_BUS_BIN_DIR, 'agent-bus');
  fs.symlinkSync(path.join(wide, 'my-tools', 'custom-bus'), mine);
  run(['install', '--uninstall'], { extraEnv: dirs });
  assert.equal(fs.readlinkSync(mine), path.join(wide, 'my-tools', 'custom-bus'), 'a link the user made stays');
  assert.ok(fs.existsSync(path.join(wide, 'my-tools', 'custom-bus')), 'and a directory without install\'s marker is never removed');
});

test('with a report thread set, the Codex chat is told what was asked and what was answered — and a lost report loses nothing', async () => {
  const reports = queuedMessages;
  const reporting = await serve(['--endpoint', 'codex-reports', '--exec-timeout', '3'], project, { AGENT_BUS_REPORT_THREAD: 'thread-chat', AGENT_BUS_REPORT_CHARS: '60' });
  try {
    const long = `Is the healer right to wait for a live owner? ${'context '.repeat(40)}`;
    const before = reports().length;
    assert.equal(run(['ask', 'codex-reports', long, '--conversation', 'ticket-reported', '--timeout', '20']).status, 0);
    // The reply is delivered first and reported second, so the asker is back before the second report lands.
    for (const end = Date.now() + 10000; reports().length < before + 2 && Date.now() < end;) await new Promise((r) => setTimeout(r, 100));
    const [received, answered] = reports().slice(before);
    assert.equal(received.thread, 'thread-chat');
    assert.match(received.message, /^\[agent-bus:status\] Received a question from claude-test — message \S+, conversation ticket-reported\./);
    assert.match(received.message, /not an instruction from the user/);
    assert.match(received.message, /Is the healer right to wait for a live owner\?/);
    assert.match(received.message, /more characters\)/, 'a long request is excerpted, never sent whole as an argument');
    assert.match(received.message, /Whole text: .*claimed\/codex-reports\//);
    assert.match(answered.message, /^\[agent-bus:status\] Answered message \S+ from claude-test\./);
    assert.match(answered.message, /VERDICT: APPROVE/);
    assert.match(answered.message, /Whole text: .*replies\//);
  } finally { await stop(reporting); }
  const deaf = await serve(['--endpoint', 'codex-deaf', '--exec-timeout', '3'], project, { AGENT_BUS_REPORT_THREAD: 'thread-broken' });
  try { assert.equal(run(['ask', 'codex-deaf', 'still answered?', '--timeout', '20']).status, 0); } finally { await stop(deaf); }
});

test('recover lists what was claimed and never answered, and puts one back only when told to', () => {
  const id = run(['send', 'codex-crashed', 'half done?']).stdout.trim();
  run(['wait', 'codex-crashed', '--timeout', '5'], { as: 'codex-crashed' });          // claimed, then the agent died
  assert.match(run(['recover', 'codex-crashed']).stdout, new RegExp(`^${id}\\tquestion\\tfrom claude-test`));
  assert.match(run(['recover', 'codex-crashed', '--requeue', id]).stdout, /requeued/);
  assert.equal(JSON.parse(run(['wait', 'codex-crashed', '--timeout', '5'], { as: 'codex-crashed' }).stdout).id, id);
});

// ---- the channel to a Codex chat the user has open ----------------------------------------------

// A chat is a rollout file that a RUNNING process holds open; the file alone outlives the session.
// So the fake chat is a file plus a process sitting on it, and closing the chat means killing it.
const holders = [];
function fakeChat({ thread, cwd, originator = 'codex-tui', source = 'cli' }) {
  const file = path.join(codexHome, 'sessions', '2026', '09', '21', `rollout-${thread}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ type: 'session_meta', payload: { id: thread, session_id: thread, cwd, originator, source, cli_version: '0.155.1' } })}\n`);
  return { file, holder: hold([file]), thread };
}

// A session of the current CLI: it holds a lock named after its thread and writes no rollout at
// all; what the thread is only appears in the thread store, and only once somebody has spoken.
function fakeLockedThread(thread) {
  const lock = path.join(codexHome, 'thread-writer-locks', `${thread}.lock`);
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(lock, '');
  return { holder: hold([lock]), thread };
}

// The rows Codex would have written for those threads once they had a turn.
function fakeThreadStore(rows) {
  const db = path.join(codexHome, 'state_5.sqlite');
  const sql = ['create table if not exists threads (id TEXT PRIMARY KEY, cwd TEXT, source TEXT, thread_source TEXT, name TEXT, title TEXT, preview TEXT, first_user_message TEXT);']
    .concat(rows.map((r) => `insert or replace into threads values ('${r.id}','${r.cwd}','${r.source ?? 'cli'}','${r.thread_source ?? ''}','${r.name ?? ''}','','','');`)).join('\n');
  return spawnSync('sqlite3', [db], { input: sql, encoding: 'utf8' }).status === 0;
}

// A process that keeps those files open, as a running Codex does, until the test closes it.
function hold(files) {
  const holder = spawn(process.execPath, ['-e', 'const fs=require("node:fs"); for (const f of process.argv.slice(1)) fs.openSync(f,"r"); setInterval(()=>{},1000);', ...files], { stdio: 'ignore', cwd: project });
  holders.push(holder);
  return holder;
}
const close = (chat) => new Promise((resolve) => { chat.holder.on('exit', resolve); chat.holder.kill(); });
const lsof = spawnSync('lsof', ['-v'], { encoding: 'utf8' });

after(() => holders.forEach((h) => h.kill()));

const chatTests = { skip: lsof.error ? 'lsof is not installed' : false };

test('connect finds the Codex chat open for this project and the handshake lands in it', chatTests, async () => {
  const chat = fakeChat({ thread: 'chat-for-project', cwd: project });
  fakeChat({ thread: 'chat-elsewhere', cwd: path.join(tmp, 'another') });                 // another project
  fakeChat({ thread: 'chat-subagent', cwd: project, source: { subagent: { other: 'guardian' } } });  // nobody watches it
  const before = queuedMessages().length;
  const ran = codexCalls().length;
  const r = run(['connect', 'codex-chat', '--cd', project], { as: 'claude-here' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /connected "codex-chat": Codex chat chat-for-project/);
  const [handshake] = queuedMessages().slice(before);
  assert.equal(handshake.thread, 'chat-for-project', 'not the subagent rollout and not the other project');
  assert.match(handshake.message, /^\[agent-bus\] question from "claude-here"/m);
  assert.match(handshake.message, /Roles are not fixed here/);
  assert.match(handshake.message, /Reply with:  agent-bus reply \d+-[0-9a-f]{8} -/);
  assert.match(handshake.message, /another coding agent asking, not the user/);

  // Queued into the chat = delivered: it is not left in the inbox for something else to claim,
  // and the sender is told who took it.
  const id = r.stdout.match(/Handshake sent as (\S+)/)[1];
  assert.deepEqual(ls('inbox', 'codex-chat'), [], 'a chat message never passes through the inbox');
  assert.ok(fs.existsSync(path.join(bus, 'claimed', 'codex-chat', `${id}.json`)));
  assert.match(run(['acked', id, '--timeout', '5']).stdout, /queued into Codex chat chat-for-project/);

  // …and the chat answers with the ordinary command, which the sender is waiting for.
  run(['reply', id, 'Got it — I can read the mailbox.'], { as: 'codex-chat' });
  assert.equal(run(['await', id, '--timeout', '5']).stdout, 'Got it — I can read the mailbox.\n');
  assert.equal(codexCalls().length, ran, 'a live chat is never run headless behind the user\'s back');
  await close(chat);
});

test('a message to a chat that is gone is withdrawn, not left for whatever claims it next', chatTests, async () => {
  const chat = fakeChat({ thread: 'chat-that-closes', cwd: project });
  assert.equal(run(['connect', 'codex-gone', '--cd', project]).status, 0);
  await close(chat);                                     // the user closed the chat
  fs.writeFileSync(path.join(codexHome, 'sessions', '2026', '09', '21', 'rollout-chat-that-closes.jsonl'), fs.readFileSync(chat.file));   // its file stays behind
  const held = ls('claimed', 'codex-gone').length;          // the handshake of the connect above
  const r = run(['send', 'codex-gone', 'anybody there?']);
  assert.equal(r.status, 6);
  assert.match(r.stderr, /not delivered to "codex-gone".*agent-bus connect codex-gone/s);
  assert.deepEqual(ls('inbox', 'codex-gone'), [], 'nothing is left queued for a chat nobody reads');
  assert.equal(ls('claimed', 'codex-gone').length, held, 'and nothing half-delivered either');
  // Connecting again forgets the closed chat and falls back to a background Codex.
  const again = run(['connect', 'codex-gone', '--cd', project]);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /connected "codex-gone": a background Codex/);
  run(['disconnect', 'codex-gone']);
});

test('a chat that cannot be reached at all leaves no peer behind', chatTests, async () => {
  const chat = fakeChat({ thread: 'thread-broken', cwd: project });        // the fake codex fails to queue for this one
  const r = run(['connect', 'codex-broken', '--cd', project]);
  assert.equal(r.status, 6);
  assert.ok(!fs.existsSync(path.join(bus, 'peers', 'codex-broken.json')));
  await close(chat);
});

test('no chat open: a background Codex is started and answers — and a listener that fails to start leaves no peer behind', chatTests, () => {
  const r = run(['connect', 'codex-bg', '--cd', project]);         // no --headless: it is the fallback, not a mode to ask for
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /connected "codex-bg": a background Codex \(pid \d+\), read-only/);
  try {
    assert.match(run(['ask', 'codex-bg', 'are you there?', '--timeout', '30']).stdout, /VERDICT: APPROVE/);
    assert.match(run(['connect', 'codex-bg', '--cd', project]).stdout, /already connected \(background Codex/);
  } finally { assert.match(run(['disconnect', 'codex-bg']).stdout, /stopped the server of "codex-bg"/); }
  assert.ok(!fs.existsSync(path.join(bus, 'peers', 'codex-bg.json')));

  // A listener that refuses to start is not a connection: a peer written anyway would make every
  // later connect answer "already connected" while nothing reads the inbox.
  const broken = run(['connect', 'codex-broken-bg', '--cd', project, '--max-runs', '0']);
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /did not start[\s\S]*--max-runs/);
  assert.ok(!fs.existsSync(path.join(bus, 'peers', 'codex-broken-bg.json')));
});

test('a conversation has a budget of runs, failed ones included — not only of review rounds', async () => {
  const server = await serve(['--endpoint', 'codex-budget', '--exec-timeout', '3', '--max-runs', '2']);
  try {
    const ask = (body) => run(['ask', 'codex-budget', body, '--conversation', 'ticket-budget', '--timeout', '20']);
    assert.match(ask('PLEASE_FAIL').stderr, /exec_failed/);      // a failed run costs the same model time
    assert.equal(ask('and now a real one').status, 0);
    const third = ask('one more');
    assert.equal(third.status, 4);
    assert.match(third.stderr, /run_limit.*has used its 2 runs/);
  } finally { await stop(server); }
});

test('install replaces the 1.x reviewer skill link and lets a Codex chat write back — without touching a sandbox section already there', () => {
  const dirs = { AGENT_BUS_HOME: path.join(tmp, 'share-2'), AGENT_BUS_BIN_DIR: path.join(tmp, 'bin-2'), AGENT_BUS_CODEX_SKILLS_DIR: path.join(tmp, 'skills-2'), CODEX_HOME: path.join(tmp, 'codex-home-2') };
  const install = (...args) => run(['install', ...args], { extraEnv: dirs });
  install();
  // The old name, as 1.x installed it, pointing into the copy install manages.
  const old = path.join(dirs.AGENT_BUS_CODEX_SKILLS_DIR, 'agent-bus-reviewer');
  fs.symlinkSync(path.join(dirs.AGENT_BUS_HOME, 'codex', 'skills', 'agent-bus-reviewer'), old);
  const mine = path.join(dirs.AGENT_BUS_CODEX_SKILLS_DIR, 'my-own-skill');
  fs.symlinkSync(path.join(tmp, 'somewhere'), mine);
  assert.match(install().stdout, /removed  .*agent-bus-reviewer — the Codex skill is now "agent-bus"/);
  assert.ok(!fs.existsSync(old) && fs.lstatSync(mine).isSymbolicLink(), 'only the link install itself made');

  const config = path.join(dirs.CODEX_HOME, 'config.toml');
  fs.mkdirSync(dirs.CODEX_HOME, { recursive: true });
  fs.writeFileSync(config, 'sandbox_mode = "workspace-write"\n');
  assert.match(install('--codex-config').stdout, new RegExp(`added   ${bus} to writable_roots`));
  assert.match(fs.readFileSync(config, 'utf8'), new RegExp(`\\[sandbox_workspace_write\\]\\nwritable_roots = \\["${bus}"\\]`));
  assert.match(install('--codex-config').stdout, /kept .* already there/, 'added once');
  // A file that already configures the sandbox is never edited — the user is told what to add.
  fs.writeFileSync(config, '[sandbox_workspace_write]\nwritable_roots = ["/somewhere/else"]\n');
  const told = install('--codex-config');
  assert.match(told.stdout, new RegExp(`already configures sandbox_workspace_write[\\s\\S]*${bus}`));
  assert.equal(fs.readFileSync(config, 'utf8'), '[sandbox_workspace_write]\nwritable_roots = ["/somewhere/else"]\n');
  install('--uninstall');
});

test('two chats for one project are never picked between: the user names the one they mean', chatTests, async () => {
  const a = fakeChat({ thread: 'chat-twin-a', cwd: project });
  const b = fakeChat({ thread: 'chat-twin-b', cwd: project });
  const ambiguous = run(['connect', 'codex-twin', '--cd', project]);
  assert.equal(ambiguous.status, 1);
  assert.match(ambiguous.stderr, /2 Codex chats are open for [\s\S]*chat-twin-a[\s\S]*chat-twin-b/);
  assert.ok(!fs.existsSync(path.join(bus, 'peers', 'codex-twin.json')));
  assert.equal(run(['connect', 'codex-twin', '--cd', project, '--thread', 'chat-twin-b']).status, 0);
  // A second pair may share that chat — but it is said out loud, not discovered later.
  assert.match(run(['connect', 'codex-twin-2', '--cd', project, '--thread', 'chat-twin-b']).stdout, /NOTE: peer "codex-twin" already talks to this chat/);
  run(['disconnect', 'codex-twin']); run(['disconnect', 'codex-twin-2']);
  await close(a); await close(b);
});

test('one endpoint, one answering side: a chat and a background listener never share a name', chatTests, async () => {
  const chat = fakeChat({ thread: 'chat-exclusive', cwd: project });
  // A listener is already serving that name — 1.x left one running, say.
  const server = await serve(['--endpoint', 'codex-shared', '--exec-timeout', '3']);
  try {
    const refused = run(['connect', 'codex-shared', '--cd', project, '--thread', 'chat-exclusive']);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /served by a background Codex \(pid \d+\)[\s\S]*connect codex-shared-2/);
    assert.ok(!fs.existsSync(path.join(bus, 'peers', 'codex-shared.json')));
  } finally { await stop(server); }
  // …and the other way round: a listener refuses to serve an endpoint a chat answers for.
  assert.equal(run(['connect', 'codex-exclusive', '--cd', project, '--thread', 'chat-exclusive']).status, 0);
  const late = run(['serve-codex', '--cd', project, '--endpoint', 'codex-exclusive']);
  assert.equal(late.status, 1);
  assert.match(late.stderr, /connected to Codex chat chat-exclusive — a listener would answer the same messages/);
  // A message for a chat is never visible to a poller, so the two can never both run it.
  const id = run(['send', 'codex-exclusive', 'only the chat sees this']).stdout.trim();
  assert.deepEqual(ls('inbox', 'codex-exclusive'), []);
  assert.ok(fs.existsSync(path.join(bus, 'claimed', 'codex-exclusive', `${id}.json`)));
  run(['disconnect', 'codex-exclusive']);
  await close(chat);
});

test('a name already connected elsewhere is never quietly reused for another project or another chat', chatTests, async () => {
  fs.mkdirSync(path.join(tmp, 'other-project'), { recursive: true });
  const here = fakeChat({ thread: 'chat-here', cwd: project });
  const there = fakeChat({ thread: 'chat-there', cwd: fs.realpathSync(path.join(tmp, 'other-project')) });
  assert.equal(run(['connect', 'codex-pair', '--cd', project]).status, 0);
  for (const [args, expected] of [
    [['connect', 'codex-pair', '--cd', fs.realpathSync(path.join(tmp, 'other-project'))], /already connected for [\s\S]*project-/],
    [['connect', 'codex-pair', '--cd', project, '--thread', 'chat-there'], /already connected to Codex chat chat-here, not chat-there/],
  ]) {
    const r = run(args);
    assert.equal(r.status, 1, args.join(' '));
    assert.match(r.stderr, expected);
    assert.match(r.stderr, /agent-bus connect codex-pair-2/, 'and it says how to have both at once');
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(bus, 'peers', 'codex-pair.json'), 'utf8')).thread, 'chat-here');
  run(['disconnect', 'codex-pair']);
  await close(here); await close(there);
});

test('several pairs run at once, each with its own endpoints, and nothing crosses between them', chatTests, async () => {
  fs.mkdirSync(path.join(tmp, 'project-two'), { recursive: true });
  const root2 = fs.realpathSync(path.join(tmp, 'project-two'));
  const one = fakeChat({ thread: 'chat-pair-one', cwd: project });
  const two = fakeChat({ thread: 'chat-pair-two', cwd: root2 });
  assert.equal(run(['connect', 'codex-one', '--cd', project], { as: 'claude-one' }).status, 0);
  assert.equal(run(['connect', 'codex-two', '--cd', root2], { as: 'claude-two' }).status, 0);
  // A third pair with no chat of its own: the background Codex, at the same time as the two chats.
  assert.equal(run(['connect', 'codex-three', '--cd', project, '--headless'], { as: 'claude-three' }).status, 0);
  try {
    const sendOne = run(['send', 'codex-one', 'for pair one'], { as: 'claude-one' });
    const sendTwo = run(['send', 'codex-two', 'for pair two'], { as: 'claude-two' });
    assert.equal(sendOne.status, 0, sendOne.stderr);
    assert.equal(sendTwo.status, 0, sendTwo.stderr);
    const [a, b] = [sendOne.stdout.trim(), sendTwo.stdout.trim()];
    assert.match(run(['ask', 'codex-three', 'for pair three', '--timeout', '30'], { as: 'claude-three' }).stdout, /VERDICT: APPROVE/);
    const queuedNow = queuedMessages();
    assert.equal(queuedNow.find((q) => q.message.includes(a)).thread, 'chat-pair-one');
    assert.equal(queuedNow.find((q) => q.message.includes(b)).thread, 'chat-pair-two');
    // Each pair answers its own message; the replies go back to the right asker.
    run(['reply', a, 'one here'], { as: 'codex-one' });
    run(['reply', b, 'two here'], { as: 'codex-two' });
    assert.equal(run(['await', a, '--timeout', '5'], { as: 'claude-one' }).stdout, 'one here\n');
    assert.equal(run(['await', b, '--timeout', '5'], { as: 'claude-two' }).stdout, 'two here\n');
  } finally {
    run(['disconnect', 'codex-one']); run(['disconnect', 'codex-two']); run(['disconnect', 'codex-three']);
  }
  await close(one); await close(two);
});

test('two sessions taking one endpoint at the same moment: exactly one gets it', chatTests, async () => {
  // Eight at once, each starting a listener — the slow part is inside the registration, which is
  // where two consumers of one endpoint would otherwise both be recorded.
  const racing = Array.from({ length: 8 }, () => new Promise((resolve) => {
    const c = spawn(process.execPath, [CLI, 'connect', 'codex-race', '--cd', project, '--headless', '--exec-timeout', '3'], { env: { ...env, AGENT_BUS_NAME: 'claude-race' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { err += d; });
    c.on('exit', (code) => resolve({ code, out, err }));
  }));
  const results = await Promise.all(racing);
  const won = results.filter((r) => r.code === 0 && /connected "codex-race"/.test(r.out));
  assert.equal(won.length, 1, `exactly one connect may report success, got ${results.map((r) => `${r.code}:${(r.out || r.err).trim().split('\n')[0]}`).join(' | ')}`);
  for (const lost of results.filter((r) => r.code !== 0)) assert.match(lost.err, /taking endpoint "codex-race" right now|already connected|served by a background Codex/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(bus, 'peers', 'codex-race.json'), 'utf8')).pid, Number(won[0].out.match(/pid (\d+)/)[1]), 'the peer is the listener that actually took the lock');
  assert.match(run(['disconnect', 'codex-race']).stdout, /stopped the server/);
});

test('an lsof that could not walk the sessions tree is never read as "no chat is open"', () => {
  const bin = path.join(tmp, 'deaf-lsof');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'lsof'), '#!/bin/sh\necho "lsof: WARNING: can\'t opendir(/x): Permission denied" >&2\nexit 1\n', { mode: 0o755 });
  const blind = { PATH: `${bin}:${env.PATH}` };
  const r = run(['connect', 'codex-blind', '--cd', project], { extraEnv: blind });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /could not read all of .*sessions[\s\S]*--headless/);
  assert.ok(!fs.existsSync(path.join(bus, 'peers', 'codex-blind.json')), 'and no background Codex was started on the strength of it');
  // Naming the peer's own mode still works: the fallback is refused, not the command.
  assert.match(run(['connect', 'codex-blind', '--cd', project, '--headless', '--exec-timeout', '3'], { extraEnv: blind }).stdout, /a background Codex/);
  run(['disconnect', 'codex-blind']);
});

test('chats lists what is open with what was last said in each, and --thread takes a unique prefix', chatTests, async () => {
  const chat = fakeChat({ thread: 'chat-labelled', cwd: project });
  fs.appendFileSync(chat.file, `${JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ text: '# AGENTS.md instructions' }] } })}\n`);
  fs.appendFileSync(chat.file, `${JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ text: 'Почему healer ждёт живого владельца?\nвторая строка' }] } })}\n`);
  fs.appendFileSync(chat.file, `${JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ text: '[agent-bus:status] Received a question' }] } })}\n`);
  const listed = run(['chats']);
  assert.match(listed.stdout, /chat-labelled/);
  assert.match(listed.stdout, /^ +Почему healer ждёт живого владельца\?$/m, 'what the person typed, not the preamble and not a transport report');
  assert.equal(run(['connect', 'codex-prefix', '--cd', project, '--thread', 'chat-lab']).status, 0, 'a unique beginning of the id is enough');
  assert.match(run(['chats']).stdout, /peer "codex-prefix" talks to chat-labelled/);
  run(['disconnect', 'codex-prefix']);
  await close(chat);
});

test('a listener started on its own takes the registration itself — the held flag is only passed on by a connect that holds it', () => {
  // Somebody else is registering that endpoint right now.
  const busy = path.join(bus, 'locks', 'codex-solo.registering');
  fs.mkdirSync(busy, { recursive: true });
  const detached = run(['serve-codex', '--cd', project, '--endpoint', 'codex-solo', '--detach', '--exec-timeout', '3']);
  assert.equal(detached.status, 1);
  assert.match(detached.stderr, /taking endpoint "codex-solo" right now/);
  assert.ok(!fs.existsSync(path.join(bus, 'locks', 'codex-solo.pid')), 'and it did not take the endpoint');
  fs.rmdirSync(busy);
});

test('a registration is released once: a process that finished registering never removes somebody else\'s', async () => {
  const server = await serve(['--endpoint', 'codex-once', '--exec-timeout', '3']);   // registers, then releases
  const busy = path.join(bus, 'locks', 'codex-once.registering');
  fs.mkdirSync(busy, { recursive: true });                                           // now another process holds it
  await stop(server);
  assert.ok(fs.existsSync(busy), 'the exiting listener must not remove the registration it no longer holds');
  fs.rmdirSync(busy);
  run(['unlock', 'codex-once']);
});

test('an lsof killed before it answered is not "no chat is open" either', () => {
  const bin = path.join(tmp, 'killed-lsof');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'lsof'), '#!/bin/sh\nkill -TERM $$\n', { mode: 0o755 });
  const r = run(['connect', 'codex-killed', '--cd', project], { extraEnv: { PATH: `${bin}:${env.PATH}` } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /lsof was killed \(SIGTERM\)[\s\S]*--headless/);
  assert.ok(!fs.existsSync(path.join(bus, 'peers', 'codex-killed.json')));
});

test('--thread means the same on the second call as on the first', chatTests, async () => {
  const chat = fakeChat({ thread: 'chat-prefixed-again', cwd: project });
  assert.equal(run(['connect', 'codex-again', '--cd', project, '--thread', 'chat-prefixed']).status, 0);
  const second = run(['connect', 'codex-again', '--cd', project, '--thread', 'chat-prefixed']);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /already connected \(Codex chat chat-prefixed-again/);
  // …and a different chat under the same name is a mismatch, not a quiet switch.
  const other = fakeChat({ thread: 'chat-prefixed-other', cwd: project });
  assert.match(run(['connect', 'codex-again', '--cd', project, '--thread', 'chat-prefixed-other']).stderr, /already connected to Codex chat chat-prefixed-again, not chat-prefixed-other/);
  await close(other);
  run(['disconnect', 'codex-again']);
  await close(chat);
});

test('a listener that is late rather than dead is stopped before the registration is let go', () => {
  // `ps` is what the child needs to write its lock; this one answers long after the parent has
  // given up, which is exactly the child that used to take the endpoint after the fact.
  const bin = path.join(tmp, 'slow-ps');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'ps'), '#!/bin/sh\nsleep 12\necho "Mon Sep 21 00:00:00 2026"\n', { mode: 0o755 });
  const started = Date.now();
  const r = run(['connect', 'codex-late', '--cd', project, '--headless', '--exec-timeout', '3'], { extraEnv: { PATH: `${bin}:${env.PATH}` } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /did not start|neither started nor stopped/);
  assert.ok(!fs.existsSync(path.join(bus, 'peers', 'codex-late.json')));
  // Past the moment that child would have finished writing its lock.
  while (Date.now() - started < 16000) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  assert.ok(!fs.existsSync(path.join(bus, 'locks', 'codex-late.pid')), 'the child never takes the endpoint afterwards');
  assert.ok(!fs.existsSync(path.join(bus, 'locks', 'codex-late.registering')), 'and the registration is not left held');
});

test('disconnect signals the listener this peer stands for, never whoever holds the endpoint by then', chatTests, () => {
  assert.equal(run(['connect', 'codex-replaced', '--cd', project, '--headless', '--exec-timeout', '3']).status, 0);
  const peer = path.join(bus, 'peers', 'codex-replaced.json');
  const rec = JSON.parse(fs.readFileSync(peer, 'utf8'));
  // As if that listener had gone and another had taken the endpoint between the two steps of a
  // disconnect: the lock is a live listener, but not the one this peer was connected to.
  fs.writeFileSync(peer, JSON.stringify({ ...rec, pid: rec.pid + 100000 }));
  const r = run(['disconnect', 'codex-replaced']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /served by pid \d+, not by the pid \d+ that was connected here — nothing was signalled/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(bus, 'locks', 'codex-replaced.pid'), 'utf8')).pid, rec.pid, 'and that listener is untouched');
  assert.match(run(['stop', 'codex-replaced']).stdout, /stopped the server/);
});

test('a session of the current CLI is found by the lock it holds, with no rollout file at all', { skip: lsof.error ? 'lsof is not installed' : false }, async () => {
  const chat = fakeLockedThread('11111111-1111-7111-8111-111111111111');
  const sub = fakeLockedThread('22222222-2222-7222-8222-222222222222');      // its subagent's thread
  if (!fakeThreadStore([
    { id: chat.thread, cwd: project, thread_source: 'user', name: 'Чинить healer' },
    { id: sub.thread, cwd: project, thread_source: 'subagent' },
  ])) { await close(chat); await close(sub); return; }                        // no sqlite3 here
  const listed = run(['chats']);
  assert.match(listed.stdout, /11111111-1111/, 'the chat is found through its lock');
  assert.match(listed.stdout, /^ +Чинить healer$/m, 'and named by what the thread store calls it');
  assert.doesNotMatch(listed.stdout, /22222222-2222/, 'a subagent thread is not a chat');
  assert.equal(run(['connect', 'codex-locked', '--cd', project]).status, 0);
  assert.match(queuedMessages().pop().thread, /^11111111-1111/);
  run(['disconnect', 'codex-locked']);
  await close(chat); await close(sub);
});

test('a Codex that is open but has not been spoken to is said out loud, not answered with a background one', { skip: lsof.error ? 'lsof is not installed' : false }, async () => {
  // Open: it holds a lock. Never used: no thread store row and no rollout — nothing to queue into.
  const fresh = fakeLockedThread('33333333-3333-7333-8333-333333333333');
  assert.match(run(['chats']).stdout, new RegExp(`Codex sessions? (is|are) open with no conversation yet[\\s\\S]*${project}  \\(pid ${fresh.holder.pid}\\)`));
  const r = run(['connect', 'codex-fresh', '--cd', project]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /a Codex is open for .*nothing has been said in it yet[\s\S]*Type anything there/);
  assert.ok(!fs.existsSync(path.join(bus, 'peers', 'codex-fresh.json')), 'and no background Codex was started instead');
  await close(fresh);
});
