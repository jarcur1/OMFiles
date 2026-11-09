# OMFiles (`omp-omfiles`)

Native [Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi) plugin providing selectable multi-agent workflows (**Normal**, **Deep**, **Cyber**, and **Code**) and ten specialized agents.

Workflows guide the top-level manager's coordination, reasoning, and delegation patterns. They operate within OMP's native plugin architecture and respect host permissions and user approval settings.

## What is included

| Component | Path | Description |
| --- | --- | --- |
| Extension Entry | `src/index.js` | Registers `/workflow` commands and manages session workflow prompts and state. |
| Shared Policies | `rules/omfiles.md` | Static, always-applied multi-agent routing rules and tool/subagent safety policies (`alwaysApply: true`). |
| Workflows | `workflows/*.md` | Active workflow instructions for `normal`, `deep`, `cyber`, and `code`. |
| Specialist Agents | `agents/*.md` | Ten specialized agents with dedicated role definitions and restricted toolsets. |
| Config Examples | `config.example.yml`, `models.example.yml` | Optional reference templates for manager roles, approvals, and custom providers. |

## Installation

You can install `omp-omfiles` directly from GitHub into your OMP environment.

### Isolated Profile (Recommended)

Using a dedicated profile keeps plugin settings, authentication, and sessions separate from your default profile:

```sh
omp --profile omfiles plugin install github:jarcur1/OMFiles#coding/native-omp-plugin
```

### Default Profile

To install into your default profile:

```sh
omp plugin install github:jarcur1/OMFiles#coding/native-omp-plugin
```

> **Note on `#coding/native-omp-plugin`:** The `#coding/native-omp-plugin` ref pins installation to the active plugin implementation branch prior to merging. Once merged into the default branch, the `#ref` suffix can be omitted (`github:jarcur1/OMFiles`).

Restart OMP after installation to ensure all plugin extensions, rules, and agents are discovered.

Start the profile you installed into:

```sh
omp --profile omfiles
```

Use `/login` to authenticate your own supported providers and `/model` to inspect available models. Installing this plugin does not supply subscriptions, API keys, or access to the specialists' default models.

## Workflow Commands and Switching

Workflow selection is explicit and managed via the `/workflow` command. Workflow mode is independent of the manager model, allowing you to switch workflows while keeping your preferred model or to change both together.

### Status and Inspection

```text
/workflow
/workflow status
```

Reports the active workflow mode, current manager model, available modes (`normal`, `deep`, `cyber`, `code`), and command usage. This inspection command does not invoke model inference.

### Switching Workflows

```text
/workflow normal
/workflow deep
/workflow cyber
/workflow code
```

Switches the active workflow instructions for the current session while **keeping your current manager model**. Fresh sessions default to `normal`.

Switches wait for the current work to become idle. If another workflow transition is already pending, the new request is rejected with a retry notification. Navigating to another session or branch while a switch is waiting cancels that pending switch. Navigation is briefly refused while an explicit manager model change is in flight; retry it after the change completes. Workflow selection is available only in the main manager session, not specialist sessions.

### Switching Workflow and Model

```text
/workflow code --model @CODE
/workflow deep --model openai-codex/gpt-6.1-sol
```

Switches the workflow mode and simultaneously switches the manager model using OMP's model resolution.
- Accepts concrete model selectors (e.g., `google-antigravity/gemini-3.8-flash`) or user-configured role aliases (e.g., `@CODE`, `@DEEP`).
- If the selector cannot be resolved or the model change is refused by the host, the workflow mode remains unchanged and an error notification is emitted.

`--model` selects the model; use OMP's native thinking controls for reasoning effort. Selecting a workflow without `--model` never changes your model or thinking settings.

### Session Persistence

- Workflow mode is persisted per session branch under the record namespace `io.github.jarcur1.omfiles.workflow`.
- Only the workflow mode is stored. The plugin does not persist model selectors, respecting OMP's native session model restoration and manual `/model` selections.
- When switching sessions, branching, or navigating session trees, the latest valid mode for that branch is restored (defaulting to `normal` if no mode record exists on the branch).

## Specialist Agents

The plugin provides ten named specialist agents discovered automatically by OMP:

| Agent | Default Model Selector | Responsibility |
| --- | --- | --- |
| `gemini-worker` | `google-antigravity/gemini-3.8-flash` | Read-only investigation and mechanical analysis. |
| `gemini-professor` | `google-antigravity/gemini-3.8-flash` | Conceptual explanation, critique, and alternative reasoning. |
| `sol-expert` | `openai-codex/gpt-6.1-sol` | Selective escalation for difficult reasoning or adjudication. |
| `cyber-blue` | `openai-codex/gpt-daybreak-blue-latest` | Defensive security analysis, threat hunting, and hardening. |
| `cyber-red` | `abliteration/abliterated-model-large-v2` | Authorized offensive-security and red-team analysis (read-only). |
| `code-scout` | `google-antigravity/gemini-3.8-flash` | Repository exploration and execution-path investigation. |
| `code-builder` | `google-antigravity/gemini-3.8-flash` | Routine and moderately complex code implementation and test runs. |
| `code-reviewer` | `openai-codex/gpt-6.1-sol` | Independent primary code review. |
| `code-reviewer-argon` | `google-antigravity/gemini-4-argon` | Selective secondary code review (quota-constrained). |
| `code-architect` | `google-antigravity/claude-opus-5-5` | High-level system design and architecture investigation. |

### Permissions and Safety Boundaries

- **Tool restrictions:** `code-builder` is the only specialist authorized to mutate files or execute development commands. All other specialists (`gemini-worker`, `gemini-professor`, `sol-expert`, `cyber-blue`, `cyber-red`, `code-scout`, `code-reviewer`, `code-reviewer-argon`, `code-architect`) are strictly read-only.
- **Git delivery:** The top-level manager coordinates commits, pushes, and pull requests subject to explicit user direction. Specialists never independently commit or push.
- **Cybersecurity authorization:** Cyber workflows cover authorized defensive and red-team exercises. Scope boundaries provided by the user are strictly observed.
- **Agent Hub:** Press `Alt+A` to inspect running specialist sessions or conduct direct follow-up (such as direct communication with `cyber-red`).

## Optional Configuration and Providers

Installing the plugin does not alter your existing `config.yml` or `models.yml`. Example configuration files are provided for optional user opt-in:

### `config.example.yml`

Demonstrates role aliases and recommended settings:
- Configuring `modelRoles` (`default`, `DEEP`, `CYBER`, `CODE`) enables role-backed switching such as `/workflow code --model @CODE`.
- Demonstrates safe approval defaults (`tools.approvalMode: always-ask`, `tools.approval.computer: prompt`). Users may explicitly opt into `tools.approvalMode: yolo` for routine operations if desired.
- Configures agent session idle TTL (`task.agentIdleTtlMs: 1200000`).

To use these settings, merge the desired keys into your profile's `config.yml`.

### `models.example.yml`

Provides an optional custom OpenAI-compatible provider definition for `cyber-red` (Abliteration):
- Expects the API key in the `ABLITERATION_API_KEY` environment variable. Never commit secret credentials.
- Merge into your profile's `models.yml` if you have access to this endpoint, or override the specialist's model in your own configuration instead of editing the installed package.

Specialist defaults are independent of the manager model. To substitute models persistently, use OMP's `task.agentModelOverrides` in your own `config.yml`, with concrete selectors or roles you configured. For example, to route `cyber-red` through your `CYBER` role:

```yaml
task:
  agentModelOverrides:
    cyber-red: "@CYBER"
```

This avoids losing substitutions when the plugin is upgraded. Model resolution does not guarantee that your account can make a successful provider request.

## Updating and Uninstalling

### Upgrading

To update the installed plugin to the latest revision of its recorded Git ref:

```sh
# For isolated profile
omp --profile omfiles plugin upgrade omp-omfiles

# For default profile
omp plugin upgrade omp-omfiles
```

### Uninstalling

To remove the plugin:

```sh
# For isolated profile
omp --profile omfiles plugin uninstall omp-omfiles

# For default profile
omp plugin uninstall omp-omfiles
```

Restart OMP after upgrading or uninstalling so the session's rules and agent roster match the installed plugin set. Uninstalling the plugin does not remove your own configuration, credentials, or saved session history.

## Migrating from Manual Configuration Packs

If you previously installed OMFiles by manually copying `RULES.md` and `agents/*.md` into `~/.omp/agent/` or a profile directory:

1. **Back up personal settings:** Back up your existing `config.yml`, `models.yml`, and any custom agents.
2. **Retire obsolete manual rules:** If the installed `RULES.md` contains only the old OMFiles pack, move it to your backup outside OMP's discovery directories. If it contains personal rules too, remove only the old OMFiles sections and preserve the rest. Shared plugin policies now load from `rules/omfiles.md`.
3. **Resolve shadowed agents:** Back up and retire only the previously copied OMFiles agent files you want replaced. Keep personal changes by merging them into intentional user overrides. OMP project/user/profile agents take precedence over plugin-provided agents.
4. **Role inference retired:** Workflows are no longer inferred from model roles. Use the `/workflow` slash command to select workflows.

## Development and Testing

To develop or test `omp-omfiles` locally:

1. Clone the repository:
   ```sh
   git clone --branch coding/native-omp-plugin https://github.com/jarcur1/OMFiles.git
   cd OMFiles
   ```
2. Link the plugin into your development profile:
   ```sh
   omp --profile omfiles-dev plugin link .
   ```
   > **Note:** `omp plugin link` links the current directory into the active OMP profile. Use a dedicated profile (`--profile <name>`) to avoid altering your daily workflow profile.

3. Run the automated test suite using Node's built-in test runner:
   ```sh
   npm test
   # or directly:
   node --test
   ```

## Verification

Verified on Windows with OMP `18.18.2` and Node `24.15.0`:

- `node --test`: 25 passing regression tests, including navigation races, model refusals, empty selectors, specialist isolation, and preservation of existing prompt content.
- A real isolated OMP profile loaded the native plugin, all ten agents, shared policies, and `/workflow`.
- All four modes produced exactly one active workflow section in actual provider requests. Workflow-only switches preserved the selected model and reasoning settings.
- Explicit role-backed model selection, invalid-model handling, tree navigation, new-session reset, session switching, and process resume were exercised.
- Existing configuration and approval settings were unchanged.
- `npm pack --dry-run --json` included the 21 intended public runtime/documentation files. The package allowlist names shipped files explicitly instead of including private local overrides.

Provider-request checks used ten requests to a temporary loopback-only fixture, not external model services. They verify OMP integration and prompt delivery, not the reasoning quality or account availability of the named cloud models. The temporary profiles and fixture were removed after verification.

## License

[MIT](LICENSE)
