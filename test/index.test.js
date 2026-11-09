import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import omfilesExtension, {
  STATE_NAMESPACE,
  DEFAULT_MODE,
  parseWorkflowArgs,
  restoreModeFromBranch,
  buildInjectedSystemPrompt,
} from '../src/index.js';

function createMockPi() {
  const handlers = new Map();
  const commands = new Map();
  const entries = [];
  const modelCalls = [];

  const pi = {
    handlers,
    commands,
    entries,
    modelCalls,
    label: null,
    setLabel(label) {
      pi.label = label;
    },
    on(event, handler) {
      if (!handlers.has(event)) {
        handlers.set(event, []);
      }
      handlers.get(event).push(handler);
    },
    registerCommand(name, def) {
      commands.set(name, def);
    },
    appendEntry(customType, data) {
      entries.push({ customType, data });
    },
    async setModel(model) {
      modelCalls.push(model);
      if (model?.refuse) return false;
      if (model?.throw) throw new Error('Model switch failed');
      return true;
    },
    async emit(event, payload, ctx) {
      const list = handlers.get(event) || [];
      let result;
      for (const h of list) {
        result = await h(payload, ctx);
      }
      return result;
    }
  };
  return pi;
}

function createMockCtx(options = {}) {
  const notifications = [];
  const statusUpdates = new Map();
  let branch = options.branch || [];

  return {
    sessionId: options.sessionId || 'session-1',
    agent: options.agent || { kind: 'main' },
    notifications,
    statusUpdates,
    waitForIdle: options.waitForIdle || (async () => {}),
    ui: {
      notify(msg, type) {
        notifications.push({ msg, type });
      },
      setStatus(id, status) {
        statusUpdates.set(id, status);
      }
    },
    models: {
      current() {
        return options.currentModel || { provider: 'google', id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' };
      },
      resolve(selector) {
        if (options.resolvableModels && options.resolvableModels[selector]) {
          return options.resolvableModels[selector];
        }
        return undefined;
      }
    },
    sessionManager: {
      getSessionId() {
        return options.sessionId || 'session-1';
      },
      getBranch() {
        return branch;
      },
      setBranch(b) {
        branch = b;
      }
    }
  };
}

describe('OMFiles Core Extension', () => {
  describe('1. invalid model leaves workflow state', () => {
    it('leaves workflow unchanged when model selector is unresolvable', async () => {
      const pi = createMockPi();
      omfilesExtension(pi);

      const ctx = createMockCtx({
        resolvableModels: {
          '@CODE': { provider: 'openai', id: 'gpt-6.1-sol' }
        }
      });

      const cmd = pi.commands.get('workflow');
      assert.ok(cmd, 'workflow command registered');

      // Attempt to switch with an unresolvable model
      await cmd.handler('cyber --model @NONEXISTENT', ctx);

      // Verify notification has error
      assert.strictEqual(ctx.notifications.length, 1);
      assert.strictEqual(ctx.notifications[0].type, 'error');

      // Verify no state entry appended
      assert.strictEqual(pi.entries.length, 0);

      // Verify setModel was never called
      assert.strictEqual(pi.modelCalls.length, 0);

      // Verify before_agent_start still injects default 'normal' mode
      const res = await pi.emit('before_agent_start', { systemPrompt: 'Base prompt', reason: 'prompt' }, ctx);
      assert.ok(res.systemPrompt.includes('Normal Mode'), 'remained in normal mode');
      assert.ok(!res.systemPrompt.includes('Cyber Mode'), 'did not switch to cyber');
    });

    it('leaves workflow unchanged when pi.setModel returns false (refusal)', async () => {
      const pi = createMockPi();
      omfilesExtension(pi);

      const ctx = createMockCtx({
        resolvableModels: {
          '@UNAUTH': { provider: 'openai', id: 'gpt-unauth', refuse: true }
        }
      });

      const cmd = pi.commands.get('workflow');
      await cmd.handler('cyber --model @UNAUTH', ctx);

      // Verify error notification
      assert.strictEqual(ctx.notifications.length, 1);
      assert.strictEqual(ctx.notifications[0].type, 'error');

      // setModel was attempted
      assert.strictEqual(pi.modelCalls.length, 1);

      // State remains unchanged
      assert.strictEqual(pi.entries.length, 0);

      // Active mode still normal
      const res = await pi.emit('before_agent_start', { systemPrompt: 'Base prompt', reason: 'prompt' }, ctx);
      assert.ok(res.systemPrompt.includes('Normal Mode'));
      assert.ok(!res.systemPrompt.includes('Cyber Mode'));
    });

    it('leaves workflow unchanged when pi.setModel throws an exception', async () => {
      const pi = createMockPi();
      omfilesExtension(pi);

      const ctx = createMockCtx({
        resolvableModels: {
          '@EXPLODE': { provider: 'openai', id: 'gpt-explode', throw: true }
        }
      });

      const cmd = pi.commands.get('workflow');
      await cmd.handler('deep --model @EXPLODE', ctx);

      assert.strictEqual(ctx.notifications.length, 1);
      assert.strictEqual(ctx.notifications[0].type, 'error');

      assert.strictEqual(pi.entries.length, 0);

      const res = await pi.emit('before_agent_start', { systemPrompt: 'Base prompt', reason: 'prompt' }, ctx);
      assert.ok(res.systemPrompt.includes('Normal Mode'));
      assert.ok(!res.systemPrompt.includes('Deep Mode'));
    });
  });

  describe('2. restoration and branch isolation', () => {
    it('restores to normal when branch is empty or lacks state', () => {
      assert.strictEqual(restoreModeFromBranch([]), DEFAULT_MODE);
      assert.strictEqual(restoreModeFromBranch(null), DEFAULT_MODE);
      assert.strictEqual(restoreModeFromBranch(undefined), DEFAULT_MODE);
    });

    it('restores active mode from latest valid state record in branch', () => {
      const branch = [
        { type: 'message', id: '1' },
        { type: 'custom', customType: STATE_NAMESPACE, data: { version: 1, mode: 'deep' } },
        { type: 'message', id: '2' },
        { type: 'custom', customType: STATE_NAMESPACE, data: { version: 1, mode: 'code' } }
      ];
      assert.strictEqual(restoreModeFromBranch(branch), 'code');
    });

    it('ignores malformed records, wrong versions, and unknown modes', () => {
      const branch = [
        { type: 'custom', customType: STATE_NAMESPACE, data: null },
        { type: 'custom', customType: STATE_NAMESPACE, data: { version: 2, mode: 'code' } },
        { type: 'custom', customType: STATE_NAMESPACE, data: { version: 1, mode: 'unknown-turbo' } },
        { type: 'custom', customType: 'other.extension', data: { mode: 'code' } }
      ];
      assert.strictEqual(restoreModeFromBranch(branch), DEFAULT_MODE);
    });

    it('session lifecycle hooks (start, switch, branch, tree) restore state', async () => {
      const pi = createMockPi();
      omfilesExtension(pi);

      const ctx = createMockCtx({
        branch: [
          { type: 'custom', customType: STATE_NAMESPACE, data: { version: 1, mode: 'cyber' } }
        ]
      });

      // session_start restores cyber
      await pi.emit('session_start', {}, ctx);
      assert.strictEqual(ctx.statusUpdates.get('omfiles-workflow'), 'workflow: cyber');

      // Now switch to a branch with no state -> resets to normal
      ctx.sessionManager.setBranch([]);
      await pi.emit('session_switch', {}, ctx);
      assert.strictEqual(ctx.statusUpdates.get('omfiles-workflow'), 'workflow: normal');

      // Branch to a branch with deep mode
      ctx.sessionManager.setBranch([
        { type: 'custom', customType: STATE_NAMESPACE, data: { version: 1, mode: 'deep' } }
      ]);
      await pi.emit('session_branch', {}, ctx);
      assert.strictEqual(ctx.statusUpdates.get('omfiles-workflow'), 'workflow: deep');

      // Tree navigation to a branch with code mode
      ctx.sessionManager.setBranch([
        { type: 'custom', customType: STATE_NAMESPACE, data: { version: 1, mode: 'code' } }
      ]);
      await pi.emit('session_tree', {}, ctx);
      assert.strictEqual(ctx.statusUpdates.get('omfiles-workflow'), 'workflow: code');
    });

    it('isolates state across independent session instances', async () => {
      const pi1 = createMockPi();
      const pi2 = createMockPi();
      omfilesExtension(pi1);
      omfilesExtension(pi2);

      const ctx1 = createMockCtx({ sessionId: 'session-1' });
      const ctx2 = createMockCtx({ sessionId: 'session-2' });

      // Switch pi1 to code
      const cmd1 = pi1.commands.get('workflow');
      await cmd1.handler('code', ctx1);

      // Verify pi1 prompt has Code Mode
      const res1 = await pi1.emit('before_agent_start', { systemPrompt: 'Prompt 1', reason: 'prompt' }, ctx1);
      assert.ok(res1.systemPrompt.includes('Code Mode'));

      // Verify pi2 remains in Normal Mode
      const res2 = await pi2.emit('before_agent_start', { systemPrompt: 'Prompt 2', reason: 'prompt' }, ctx2);
      assert.ok(res2.systemPrompt.includes('Normal Mode'));
      assert.ok(!res2.systemPrompt.includes('Code Mode'));
    });
  });

  describe('3. subagent scope', () => {
    it('leaves subagent prompts completely untouched (kind !== main)', async () => {
      const pi = createMockPi();
      omfilesExtension(pi);

      const subCtx = createMockCtx({ agent: { kind: 'sub' } });
      const res = await pi.emit('before_agent_start', { systemPrompt: 'Subagent raw prompt', reason: 'prompt' }, subCtx);

      // When kind !== 'main', handler returns undefined / no modification
      assert.strictEqual(res, undefined);
    });

    it('ignores reason revive in main session', async () => {
      const pi = createMockPi();
      omfilesExtension(pi);

      const mainCtx = createMockCtx({ agent: { kind: 'main' } });
      const res = await pi.emit('before_agent_start', { systemPrompt: 'Revived prompt', reason: 'revive' }, mainCtx);

      assert.strictEqual(res, undefined);
    });

    it('injects active mode instructions for main session on ordinary prompt', async () => {
      const pi = createMockPi();
      omfilesExtension(pi);

      const mainCtx = createMockCtx({ agent: { kind: 'main' } });
      const res = await pi.emit('before_agent_start', { systemPrompt: 'Main prompt', reason: 'prompt' }, mainCtx);

      assert.ok(res && res.systemPrompt);
      assert.ok(res.systemPrompt.includes('Normal Mode'));
    });
  });

  describe('4. changing modes does not stack mode prompts', () => {
    it('replaces previous workflow injection without stacking in string prompt', async () => {
      const pi = createMockPi();
      omfilesExtension(pi);
      const ctx = createMockCtx();

      // Turn 1 in normal mode
      const turn1 = await pi.emit('before_agent_start', { systemPrompt: 'Base instructions.', reason: 'prompt' }, ctx);
      assert.ok(turn1.systemPrompt.includes('Normal Mode'));

      // Switch to deep mode
      const cmd = pi.commands.get('workflow');
      await cmd.handler('deep', ctx);

      // Turn 2 receives the prompt from turn 1
      const turn2 = await pi.emit('before_agent_start', { systemPrompt: turn1.systemPrompt, reason: 'prompt' }, ctx);

      // Must contain Deep Mode
      assert.ok(turn2.systemPrompt.includes('Deep Mode'));
      // Must NOT contain Normal Mode
      assert.ok(!turn2.systemPrompt.includes('Normal Mode'));

      // Only ONE workflow marker in prompt
      const matches = turn2.systemPrompt.match(/<!-- OMFiles Active Workflow: /g);
      assert.strictEqual(matches.length, 1);
    });

    it('replaces previous workflow injection without stacking in array prompt', async () => {
      const pi = createMockPi();
      omfilesExtension(pi);
      const ctx = createMockCtx();

      const initialArray = ['System Rule 1', 'System Rule 2'];

      // Turn 1 in normal mode
      const turn1 = await pi.emit('before_agent_start', { systemPrompt: initialArray, reason: 'prompt' }, ctx);
      assert.ok(Array.isArray(turn1.systemPrompt));
      assert.strictEqual(turn1.systemPrompt.length, 3);
      assert.strictEqual(turn1.systemPrompt[0], 'System Rule 1');
      assert.strictEqual(turn1.systemPrompt[1], 'System Rule 2');
      assert.ok(turn1.systemPrompt[2].includes('Normal Mode'));

      // Switch to cyber mode
      const cmd = pi.commands.get('workflow');
      await cmd.handler('cyber', ctx);

      // Turn 2 receives turn 1's array
      const turn2 = await pi.emit('before_agent_start', { systemPrompt: turn1.systemPrompt, reason: 'prompt' }, ctx);
      assert.ok(Array.isArray(turn2.systemPrompt));
      assert.strictEqual(turn2.systemPrompt.length, 3, 'still has exactly 3 elements, no stacking');
      assert.strictEqual(turn2.systemPrompt[0], 'System Rule 1');
      assert.strictEqual(turn2.systemPrompt[1], 'System Rule 2');
      assert.ok(turn2.systemPrompt[2].includes('Cyber Mode'));
      assert.ok(!turn2.systemPrompt[2].includes('Normal Mode'));
    });

    it('sequential before_agent_start calls in same mode do not duplicate injection', async () => {
      const pi = createMockPi();
      omfilesExtension(pi);
      const ctx = createMockCtx();

      let prompt = 'Static base prompt';
      for (let i = 0; i < 3; i++) {
        const res = await pi.emit('before_agent_start', { systemPrompt: prompt, reason: 'prompt' }, ctx);
        prompt = res.systemPrompt;
      }

      const matches = prompt.match(/<!-- OMFiles Active Workflow: /g);
      assert.strictEqual(matches.length, 1, 'exactly one injection block exists after multiple turns');
    });
  });


  describe('6. argument parsing and status command', () => {
    it('parses status action for empty or status string', () => {
      assert.deepStrictEqual(parseWorkflowArgs(''), { action: 'status' });
      assert.deepStrictEqual(parseWorkflowArgs('   '), { action: 'status' });
      assert.deepStrictEqual(parseWorkflowArgs('status'), { action: 'status' });
      assert.deepStrictEqual(parseWorkflowArgs('  status  '), { action: 'status' });
    });

    it('parses valid mode switches with and without model selector', () => {
      assert.deepStrictEqual(parseWorkflowArgs('normal'), {
        action: 'switch',
        mode: 'normal',
        modelSelector: null
      });
      assert.deepStrictEqual(parseWorkflowArgs('DEEP'), {
        action: 'switch',
        mode: 'deep',
        modelSelector: null
      });
      assert.deepStrictEqual(parseWorkflowArgs('code --model @CODE'), {
        action: 'switch',
        mode: 'code',
        modelSelector: '@CODE'
      });
      assert.deepStrictEqual(parseWorkflowArgs('cyber --model=gpt-5.2'), {
        action: 'switch',
        mode: 'cyber',
        modelSelector: 'gpt-5.2'
      });
    });

    it('returns error on unknown mode or missing model argument', () => {
      const errMode = parseWorkflowArgs('turbo');
      assert.strictEqual(errMode.action, 'error');

      const errModel = parseWorkflowArgs('code --model');
      assert.strictEqual(errModel.action, 'error');
    });

    it('/workflow status reports current mode and model without invoking inference', async () => {
      const pi = createMockPi();
      omfilesExtension(pi);

      const ctx = createMockCtx({
        currentModel: { provider: 'anthropic', id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' }
      });

      const cmd = pi.commands.get('workflow');
      await cmd.handler('status', ctx);

      assert.strictEqual(ctx.notifications.length, 1);
      assert.strictEqual(ctx.notifications[0].type, 'info');
      assert.match(ctx.notifications[0].msg, /\bnormal\b/);
      assert.ok(ctx.notifications[0].msg.includes('anthropic/claude-3-5-sonnet'));

      // No entries appended, no setModel calls
      assert.strictEqual(pi.entries.length, 0);
      assert.strictEqual(pi.modelCalls.length, 0);
    });
  });

  describe('navigation and transition boundaries', () => {
    function deferred() {
      let resolve;
      const promise = new Promise(r => { resolve = r; });
      return { promise, resolve };
    }

    for (const lifecycle of ['session_switch', 'session_tree']) {
      it(`cancels a queued switch after ${lifecycle} and releases the transition lock`, async () => {
        const pi = createMockPi();
        omfilesExtension(pi);
        const idle = deferred();
        const ctx = createMockCtx({ waitForIdle: () => idle.promise });
        const command = pi.commands.get('workflow');
        const pending = command.handler('code', ctx);
        ctx.sessionManager.setBranch([
          { type: 'custom', customType: STATE_NAMESPACE, data: { version: 1, mode: 'deep' } },
        ]);
        await pi.emit(lifecycle, {}, ctx);
        idle.resolve();
        await pending;
        assert.deepEqual(pi.entries, []);
        const restored = await pi.emit('before_agent_start', { systemPrompt: 'Base', reason: 'prompt' }, ctx);
        assert.ok(restored.systemPrompt.includes('Active Workflow Mode: DEEP'));
        ctx.waitForIdle = async () => {};
        await command.handler('cyber', ctx);
        assert.equal(pi.entries.at(-1).data.mode, 'cyber');
      });
    }

    it('does not publish stale mode state after an asynchronous model change', async () => {
      const pi = createMockPi();
      const changing = deferred();
      const started = deferred();
      pi.setModel = () => { started.resolve(); return changing.promise; };
      omfilesExtension(pi);
      const ctx = createMockCtx({ resolvableModels: { '@CODE': { provider: 'test', id: 'code' } } });
      const pending = pi.commands.get('workflow').handler('code --model @CODE', ctx);
      await started.promise;
      for (const before of ['session_before_switch', 'session_before_branch', 'session_before_tree']) {
        assert.deepEqual(await pi.emit(before, {}, ctx), { cancel: true });
      }
      // Also guard a host-initiated lifecycle change that bypasses cancellation.
      ctx.sessionManager.setBranch([
        { type: 'custom', customType: STATE_NAMESPACE, data: { version: 1, mode: 'deep' } },
      ]);
      await pi.emit('session_tree', {}, ctx);
      changing.resolve(true);
      await pending;
      assert.deepEqual(pi.entries, []);
      const restored = await pi.emit('before_agent_start', { systemPrompt: 'Base', reason: 'prompt' }, ctx);
      assert.ok(restored.systemPrompt.includes('Active Workflow Mode: DEEP'));
      assert.equal(await pi.emit('session_before_switch', {}, ctx), undefined);
    });

    it('rejects overlapping mode changes without losing the first command', async () => {
      const pi = createMockPi();
      omfilesExtension(pi);
      const idle = deferred();
      const ctx = createMockCtx({ waitForIdle: () => idle.promise });
      const command = pi.commands.get('workflow');
      const pending = command.handler('code', ctx);
      await command.handler('cyber', ctx);
      assert.deepEqual(pi.entries, []);
      assert.ok(ctx.notifications.some(n => n.type === 'warning'));
      idle.resolve();
      await pending;
      assert.equal(pi.entries.at(-1).data.mode, 'code');
      await command.handler('deep', ctx);
      assert.equal(pi.entries.at(-1).data.mode, 'deep');
    });

    it('does not let a specialist change workflow or model', async () => {
      const pi = createMockPi();
      omfilesExtension(pi);
      const ctx = createMockCtx({ agent: { kind: 'sub' } });
      await pi.commands.get('workflow').handler('code --model @CODE', ctx);
      assert.deepEqual(pi.entries, []);
      assert.deepEqual(pi.modelCalls, []);
    });

    it('rejects explicit empty model selectors without changing a selected workflow', async () => {
      const pi = createMockPi();
      omfilesExtension(pi);
      const ctx = createMockCtx();
      const command = pi.commands.get('workflow');
      await command.handler('deep', ctx);
      for (const args of ['code --model=', 'code --model ""', "code --model '   '"]) {
        await command.handler(args, ctx);
        assert.equal(pi.entries.length, 1);
        const result = await pi.emit('before_agent_start', { systemPrompt: 'Base', reason: 'prompt' }, ctx);
        assert.ok(result.systemPrompt.includes('Active Workflow Mode: DEEP'));
      }
      assert.deepEqual(pi.modelCalls, []);
    });
  });

  it('preserves unrelated whitespace and empty prompt fragments while replacing its own section', () => {
    const stringBase = '    an indented example\n\n';
    const first = buildInjectedSystemPrompt(stringBase, 'Normal instructions', 'normal');
    const second = buildInjectedSystemPrompt(first, 'Code instructions', 'code');
    assert.ok(second.startsWith(stringBase + '\n\n'));
    assert.equal((second.match(/<!-- OMFiles Active Workflow:/g) || []).length, 1);
    assert.ok(!second.includes('Normal instructions'));
    const arrayBase = ['    indented fragment\n', '', '\ntrailing space  '];
    const arrayFirst = buildInjectedSystemPrompt(arrayBase, 'Normal instructions', 'normal');
    const arraySecond = buildInjectedSystemPrompt(arrayFirst, 'Cyber instructions', 'cyber');
    assert.deepEqual(arraySecond.slice(0, arrayBase.length), arrayBase);
    assert.equal(arraySecond.length, arrayBase.length + 1);
    assert.ok(arraySecond.at(-1).includes('Cyber instructions'));
  });
});
