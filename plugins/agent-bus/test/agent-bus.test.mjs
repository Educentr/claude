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

let tmp, bus, project, calls, queued, env, server, serverB;

const run = (args, { input, as = 'claude-test', extraEnv = {} } = {}) =>
  spawnSync(process.execPath, [CLI, ...args], { input, encoding: 'utf8', env: { ...env, AGENT_BUS_NAME: as, ...extraEnv } });
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
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  fs.symlinkSync(path.join(here, 'fake-codex'), path.join(bin, 'codex'));
  env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, AGENT_BUS_DIR: bus, FAKE_CODEX_CALLS: calls, FAKE_CODEX_QUEUE: queued, AGENT_BUS_DEPTH: '0' };
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
  assert.equal(fs.readlinkSync(path.join(dirs.AGENT_BUS_CODEX_SKILLS_DIR, 'agent-bus-reviewer')), path.join(dirs.AGENT_BUS_HOME, 'codex', 'skills', 'agent-bus-reviewer'));
  // The copy is self-sufficient: the installed CLI finds ITS policy, not the source's.
  const doctor = spawnSync(process.execPath, [cli, 'doctor'], { encoding: 'utf8', env: { ...env, ...dirs } });
  assert.ok(doctor.stdout.includes(`ok   policy ${path.join(fs.realpathSync(dirs.AGENT_BUS_HOME), 'policies', 'reviewer.md')}`), doctor.stdout);
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
  const reports = () => (fs.existsSync(queued) ? fs.readFileSync(queued, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
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
