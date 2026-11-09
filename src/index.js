import fs from 'node:fs';

export const STATE_NAMESPACE = 'io.github.jarcur1.omfiles.workflow';
export const VALID_MODES = Object.freeze(['normal', 'deep', 'cyber', 'code']);
export const DEFAULT_MODE = 'normal';

const WORKFLOW_URLS = Object.freeze({
  normal: new URL('../workflows/normal.md', import.meta.url),
  deep: new URL('../workflows/deep.md', import.meta.url),
  cyber: new URL('../workflows/cyber.md', import.meta.url),
  code: new URL('../workflows/code.md', import.meta.url),
});

const cachedWorkflowContent = new Map();

export function loadWorkflowAsset(mode) {
  if (cachedWorkflowContent.has(mode)) {
    return cachedWorkflowContent.get(mode);
  }
  const url = WORKFLOW_URLS[mode];
  if (!url) {
    throw new Error(`Unknown workflow mode: ${mode}`);
  }
  try {
    const content = fs.readFileSync(url, 'utf8');
    cachedWorkflowContent.set(mode, content);
    return content;
  } catch (err) {
    throw new Error(`Failed to load workflow instructions for ${mode}: ${err?.message || err}`);
  }
}

export function parseWorkflowArgs(rawArgs) {
  const text = (rawArgs ?? '').trim();
  if (!text || text === 'status') {
    return { action: 'status' };
  }

  const tokens = [];
  const tokenRegex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let match;
  while ((match = tokenRegex.exec(text)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[0]);
  }

  if (tokens.length === 0 || tokens[0] === 'status') {
    return { action: 'status' };
  }

  const rawMode = tokens[0].toLowerCase();
  let modelSelector = null;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '--model' || token === '-m') {
      if (i + 1 < tokens.length) {
        modelSelector = tokens[i + 1];
        i++;
      } else {
        return { action: 'error', message: 'Missing selector after --model flag.' };
      }
    } else if (token.startsWith('--model=')) {
      modelSelector = token.slice('--model='.length);
    } else {
      return {
        action: 'error',
        message: `Unexpected argument: "${token}". Usage: /workflow [status] or /workflow <normal|deep|cyber|code> [--model <selector>]`
      };
    }
  }

  if (modelSelector !== null && !modelSelector.trim()) {
    return { action: 'error', message: 'A non-empty model selector is required after --model.' };
  }

  if (!VALID_MODES.includes(rawMode)) {
    return {
      action: 'error',
      message: `Unknown workflow mode "${tokens[0]}". Available modes: ${VALID_MODES.join(', ')}.`
    };
  }

  return {
    action: 'switch',
    mode: rawMode,
    modelSelector
  };
}

export function restoreModeFromBranch(branch) {
  if (!Array.isArray(branch)) {
    return DEFAULT_MODE;
  }
  let restored = DEFAULT_MODE;
  for (const entry of branch) {
    if (
      entry &&
      entry.type === 'custom' &&
      entry.customType === STATE_NAMESPACE &&
      entry.data &&
      typeof entry.data === 'object' &&
      entry.data.version === 1 &&
      typeof entry.data.mode === 'string' &&
      VALID_MODES.includes(entry.data.mode)
    ) {
      restored = entry.data.mode;
    }
  }
  return restored;
}

const INJECTION_END = '<!-- /OMFiles Active Workflow -->';
const INJECTION_REGEX = /(?:\n\n)?<!-- OMFiles Active Workflow: [\s\S]*?<!-- \/OMFiles Active Workflow -->/g;

export function formatWorkflowInjection(mode, content) {
  return [
    `<!-- OMFiles Active Workflow: ${mode.toUpperCase()} -->`,
    `# Active Workflow Mode: ${mode.toUpperCase()}`,
    '',
    content.trim(),
    INJECTION_END
  ].join('\n');
}

export function buildInjectedSystemPrompt(basePrompt, modeContent, mode) {
  const injection = formatWorkflowInjection(mode, modeContent);

  if (Array.isArray(basePrompt)) {
    const cleaned = basePrompt.flatMap(part => {
      if (typeof part !== 'string') return [part];
      const withoutOwnedSection = part.replace(INJECTION_REGEX, '');
      return withoutOwnedSection === '' && part !== '' ? [] : [withoutOwnedSection];
    });

    return [...cleaned, injection];
  }

  if (typeof basePrompt === 'string') {
    const cleaned = basePrompt.replace(INJECTION_REGEX, '');
    return cleaned ? `${cleaned}\n\n${injection}` : injection;
  }

  return [injection];
}

export function getModelDisplayName(model) {
  if (!model) return 'unknown';
  if (model.provider && model.id) return `${model.provider}/${model.id}`;
  return model.name || model.id || 'unknown';
}

export default function omfilesExtension(pi) {
  let activeMode = DEFAULT_MODE;
  let isTransitioning = false;
  let lifecycleRevision = 0;
  let isChangingModel = false;

  // Fail installation/startup clearly if the distributed instruction assets are missing.
  for (const mode of VALID_MODES) loadWorkflowAsset(mode);

  if (typeof pi.setLabel === 'function') {
    pi.setLabel('OMFiles');
  }

  function updateStatus(ctx) {
    if (typeof ctx?.ui?.setStatus === 'function') {
      ctx.ui.setStatus('omfiles-workflow', `workflow: ${activeMode}`);
    }
  }

  function restoreState(ctx) {
    lifecycleRevision++;
    const branch = ctx?.sessionManager?.getBranch?.();
    activeMode = restoreModeFromBranch(branch);
    updateStatus(ctx);
  }

  pi.on('session_start', async (_event, ctx) => {
    restoreState(ctx);
  });

  pi.on('session_switch', async (_event, ctx) => {
    restoreState(ctx);
  });

  pi.on('session_branch', async (_event, ctx) => {
    restoreState(ctx);
  });

  pi.on('session_tree', async (_event, ctx) => {
    restoreState(ctx);
  });

  pi.on('session_shutdown', () => { lifecycleRevision++; });

  // A queued mode-only switch can be cancelled by navigation. A model switch is
  // already changing host state, so keep its session stable until it completes.
  for (const event of ['session_before_switch', 'session_before_branch', 'session_before_tree']) {
    pi.on(event, (_event, ctx) => {
      if (isChangingModel && ctx?.agent?.kind === 'main') {
        ctx.ui.notify('A manager model change is in progress. Retry navigation after it completes.', 'warning');
        return { cancel: true };
      }
    });
  }

  pi.on('before_agent_start', async (event, ctx) => {
    if (ctx?.agent?.kind !== 'main') {
      return;
    }
    if (event?.reason === 'revive') {
      return;
    }

    const modeContent = loadWorkflowAsset(activeMode);
    return { systemPrompt: buildInjectedSystemPrompt(event.systemPrompt, modeContent, activeMode) };
  });

  pi.registerCommand('workflow', {
    description: 'Switch or view active OMFiles workflow (normal, deep, cyber, code)',
    handler: async (rawArgs, ctx) => {
      if (ctx?.agent?.kind !== 'main') {
        ctx?.ui?.notify?.('Workflow selection is available only in the main manager session.', 'warning');
        return;
      }
      const parsed = parseWorkflowArgs(rawArgs);

      if (parsed.action === 'error') {
        ctx?.ui?.notify?.(parsed.message, 'error');
        return;
      }

      if (parsed.action === 'status') {
        const currentModel = ctx?.models?.current?.();
        const modelName = getModelDisplayName(currentModel);
        const statusText = [
          `Active workflow: ${activeMode}`,
          `Manager model: ${modelName}`,
          `Available modes: ${VALID_MODES.join(', ')}`,
          '',
          'Usage:',
          '  /workflow [status]',
          '  /workflow <normal|deep|cyber|code> [--model <selector>]'
        ].join('\n');

        updateStatus(ctx);
        ctx?.ui?.notify?.(statusText, 'info');
        return;
      }

      if (parsed.action === 'switch') {
        if (isTransitioning) {
          ctx?.ui?.notify?.('A workflow transition is already in progress. Please retry shortly.', 'warning');
          return;
        }

        isTransitioning = true;
        const transitionRevision = lifecycleRevision;
        const ownershipChanged = () => lifecycleRevision !== transitionRevision;
        try {
          if (typeof ctx?.waitForIdle === 'function') {
            await ctx.waitForIdle();
          }

          if (ownershipChanged()) {
            ctx?.ui?.notify?.('Session changed during transition; workflow switch cancelled.', 'warning');
            return;
          }

          let resolvedModel = null;
          if (parsed.modelSelector !== null) {
            if (!ctx?.models?.resolve) {
              ctx?.ui?.notify?.('Model resolution is not supported in this runtime.', 'error');
              return;
            }
            resolvedModel = ctx.models.resolve(parsed.modelSelector);
            if (!resolvedModel) {
              ctx?.ui?.notify?.(`Could not resolve model selector: "${parsed.modelSelector}". Workflow remains in ${activeMode} mode.`, 'error');
              return;
            }

            try {
              isChangingModel = true;
              const switchResult = await pi.setModel(resolvedModel);
              if (switchResult === false) {
                ctx?.ui?.notify?.(`Model switch refused for "${parsed.modelSelector}". Workflow remains in ${activeMode} mode.`, 'error');
                return;
              }
            } catch (err) {
              ctx?.ui?.notify?.(`Failed to switch model to "${parsed.modelSelector}": ${err?.message || err}. Workflow remains in ${activeMode} mode.`, 'error');
              return;
            } finally {
              isChangingModel = false;
            }
          }

          if (ownershipChanged()) {
            ctx?.ui?.notify?.('Session or branch changed during transition; workflow switch cancelled.', 'warning');
            return;
          }

          pi.appendEntry(STATE_NAMESPACE, { version: 1, mode: parsed.mode });
          activeMode = parsed.mode;

          updateStatus(ctx);

          const modelSuffix = resolvedModel ? ` with manager model ${getModelDisplayName(resolvedModel)}` : '';
          ctx?.ui?.notify?.(`Workflow switched to ${activeMode} mode${modelSuffix}.`, 'info');
        } finally {
          isTransitioning = false;
        }
      }
    }
  });
}
