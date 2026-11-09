# OMFiles

Shareable [Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi) agent definitions, rules, and multi-agent workflows. These are the author's Normal, Deep, Cyber, and Code workflows, packaged without credentials or session history.

This is a configuration pack, not an OMP fork or a provider subscription. You need OMP installed and your own access to the configured models. The model IDs reflect the author's setup; availability depends on your providers and account.

**Current status:** manual configuration pack. The [plugin migration design](#plugin-migration-design-not-implemented) below describes a proposed native OMP plugin; plugin installation and `/workflow` commands are not implemented in this repository yet. Use the profile installation instructions below today.

## What is included

| File | Purpose |
| --- | --- |
| [`RULES.md`](RULES.md) | Manager routing, delegation, permissions, review, and delivery workflows. |
| [`agents/`](agents/) | Ten named specialists, including their model selectors and tool permissions. |
| [`config.example.yml`](config.example.yml) | Manager roles, role cycling, approvals, and relevant capability settings. |
| [`models.example.yml`](models.example.yml) | Optional custom provider configuration for `cyber-red`; no API key is included. |
| [`.gitignore`](.gitignore) | Allowlist to keep personal configuration and runtime data out of this repository. |

The workflows are instructions in `RULES.md` and the agent files, not separate executable workflow scripts. They guide behavior; they are not a security sandbox or a guarantee that a model will follow every instruction.

## 1. Install OMP and clone this repository

Follow the [upstream installation instructions](https://github.com/can1357/oh-my-pi#installation), then check your installation:

```sh
omp --version
git clone https://github.com/jarcur1/OMFiles.git
cd OMFiles
```

## 2. Install into a separate profile (recommended)

A named profile keeps this pack's settings, authentication, and sessions separate from your default OMP profile. The following commands use the profile name `omfiles` and the standard OMP config location. If you customize OMP/XDG paths, use your active profile's actual directory instead.

Review the files before installing. If you already use an `omfiles` profile, back it up and merge changes instead of overwriting it. The commands below ask before replacing existing files.

### macOS / Linux / Git Bash

Run from the cloned repository:

```sh
agent_dir="$HOME/.omp/profiles/omfiles/agent"
mkdir -p "$agent_dir/agents"
cp -i RULES.md "$agent_dir/RULES.md"
cp -i agents/*.md "$agent_dir/agents/"
cp -i config.example.yml "$agent_dir/config.yml"
```

### Windows PowerShell

Run from the cloned repository:

```powershell
$agentDir = Join-Path $HOME '.omp/profiles/omfiles/agent'
New-Item -ItemType Directory -Force -Path (Join-Path $agentDir 'agents') | Out-Null
Copy-Item -Path './RULES.md' -Destination (Join-Path $agentDir 'RULES.md') -Confirm
Copy-Item -Path './agents/*.md' -Destination (Join-Path $agentDir 'agents') -Confirm
Copy-Item -Path './config.example.yml' -Destination (Join-Path $agentDir 'config.yml') -Confirm
```

The `.example.yml` files are not loaded under those names: install or merge them as `config.yml` and, optionally, `models.yml`.

### Existing profile or project-only installation

To use your default profile, copy the rules and agents to `~/.omp/agent/RULES.md` and `~/.omp/agent/agents/`, then **merge** the example settings into your existing `~/.omp/agent/config.yml`. Do not replace your personal configuration wholesale.

For project-local workflows, place rules in `<project>/.omp/RULES.md`, agents in `<project>/.omp/agents/`, and merge settings into `<project>/.omp/config.yml`. Custom provider definitions still belong in the active user profile's `models.yml`. Same-name project agents override user agents. The nearest non-empty ancestor `.omp/` directory controls native project rule discovery; a closer `.omp/` can hide an ancestor's rules.

## 3. Authenticate and check model access

Start OMP in the profile you installed into:

```sh
omp --profile omfiles
```

Use `/login` for each supported provider you plan to use, and `/model` to inspect available models and roles. A new profile needs its own authentication. This repository does not supply provider access, API keys, or paid quotas.

The default routing is:

| Workflow / role | Manager | Typical use |
| --- | --- | --- |
| `default` (Normal) | `google-antigravity/gemini-3.8-flash:high` | Everyday work; selective specialist use. |
| `DEEP` | `openai-codex/gpt-6.1-sol:high` | Careful reasoning, evidence gathering, and critique. |
| `CYBER` | `openai-codex/gpt-6.1-sol:high` | Authorized security analysis with bounded specialist tasks. |
| `CODE` | `openai-codex/gpt-6.1-sol:high` | Implementation, verification, review, and Git delivery. |

All four roles are included in `cycleOrder`. Select a role in `/model`, or launch directly with one:

```sh
omp --profile omfiles --model CODE
```

The rules select workflows by the active role, not merely the underlying model. If the active role is not exposed to the manager, explicitly request the workflow in your message, for example: "Use Code Mode for this task."

### Specialists

| Agent | Model selector | Responsibility |
| --- | --- | --- |
| `gemini-worker` | `google-antigravity/gemini-3.8-flash` | Read-only investigation and routine evidence gathering. |
| `gemini-professor` | `google-antigravity/gemini-3.8-flash` | Explanation, critique, and alternative reasoning. |
| `sol-expert` | `openai-codex/gpt-6.1-sol` | Selective escalation for difficult reasoning. |
| `cyber-blue` | `openai-codex/gpt-daybreak-blue-latest` | Defensive security analysis. |
| `cyber-red` | `abliteration/abliterated-model-large-v2` | Authorized offensive-security analysis; read-only. |
| `code-scout` | `google-antigravity/gemini-3.8-flash` | Repository and execution-path investigation. |
| `code-builder` | `google-antigravity/gemini-3.8-flash` | Implementation and development commands. |
| `code-reviewer` | `openai-codex/gpt-6.1-sol` | Primary independent review. |
| `code-reviewer-argon` | `google-antigravity/gemini-4-argon` | Selective secondary review; quota-constrained. |
| `code-architect` | `google-antigravity/claude-opus-5-5` | Exceptional architecture and design investigation. |

Only `code-builder` has repository mutation and shell tools in this pack. The manager owns commits, pushes, pull requests, releases, and deployments, subject to user authorization. Agents are not all spawned automatically: the manager selects specialists when useful. `Alt+A` opens Agent Hub for running agents and direct follow-up.

### Substitute models you can access

1. Change `modelRoles` in your installed `config.yml` to select manager models.
2. Change each specialist's `model:` field in its installed Markdown file. Changing manager roles alone does not remap the specialists' concrete model selectors.
3. Update model names in your installed `RULES.md` and agent prose when necessary so instructions remain consistent.
4. Remove or adjust unsupported `thinkingLevel` values for your replacement models.

OMP also supports role-backed specialist selectors such as `model: "@review"` with a corresponding `modelRoles.review` entry. Existing `task.agentModelOverrides` settings take precedence over agent model fields; check them if a specialist uses an unexpected model.

### Optional: custom provider for `cyber-red`

If you use the supplied Abliteration selector, merge `models.example.yml` into the `models.yml` file in the same active profile directory. For a fresh profile with no existing `models.yml`, copy it there under that name. Check that the endpoint, model ID, and configured context limit match your provider access.

Set `ABLITERATION_API_KEY` in the environment of the terminal that launches OMP, or use your own secure environment/secret management. The `apiKey: ABLITERATION_API_KEY` value in the example is an environment-variable reference, not a key to replace in a committed file. Never paste credentials into an agent message or publish them.

If you do not use this provider, substitute another accessible model for `cyber-red`; the other workflows do not require Abliteration.

## 4. Use the workflows

Examples of initial messages:

- **Normal:** "Investigate this behavior. Delegate routine evidence gathering only if useful."
- **Deep:** "Use Deep Mode. Compare the alternatives, challenge the leading explanation, and verify the conclusion."
- **Code:** "Use Code Mode. Implement this change, exercise the affected behavior, and request independent review when warranted. Do not push until I authorize it."
- **Cyber:** "Use Cyber Mode. Review these logs from my authorized lab; analysis only, with no commands or changes to target systems."

Supply the task, scope, acceptance criteria, and any delivery authorization. A workflow does not authorize testing third-party systems or publishing, deploying, deleting, or changing permissions. For direct security-specialist interaction, ask the manager to activate the specialist within the authorized scope, then select the running session in Agent Hub.

### Approvals and optional integrations

The shared example explicitly uses `tools.approvalMode: always-ask`: reads are automatic; writes and execution require approval. It keeps `tools.approval.computer: prompt`.

The author's routine workflow uses `yolo`. To opt in, change `tools.approvalMode` to `yolo` in your installed config after reviewing the rules and risks. This allows routine tool execution without mode-based prompts, but does not override explicit tool policies, provider safety checks, or required computer approval. Prompt instructions and restricted agent tool lists do not provide filesystem or process containment.

GitHub, browser, and computer capabilities are enabled in the example, but their dependencies and authentication must be configured separately. Git delivery needs Git and appropriate GitHub access; browser and desktop tasks need their corresponding OMP integrations. Keep computer approval at `prompt`.

`omp-tokenmunchers` is an optional plugin in the author's environment, not a dependency of these workflows. It is not bundled or installed by this pack.

## Verify and troubleshoot

After installing, start a fresh session so rules and the agent roster are loaded together:

```sh
omp --profile omfiles config get modelRoles --json
omp --profile omfiles config get tools.approvalMode
omp --profile omfiles models find gemini
omp --profile omfiles --model CODE
```

In the new session, ask the manager to identify the active workflow and available named specialists without spawning them. To verify actual dispatch, request one small, read-only task from a specialist whose model you can access, then inspect the selected model and result in Agent Hub. That dispatch consumes your own provider quota.

- **Missing agents:** ensure files are directly inside the active profile's `agents/` directory, use `.md` filenames, and begin with valid YAML frontmatter delimited by `---`. Inspect OMP startup warnings.
- **Missing rules:** confirm the installed filename is `RULES.md`, rules discovery is enabled, and a project-level configuration is not changing discovery.
- **Unavailable model:** authenticate to the provider or substitute an accessible selector. Do not assume an account has access because a model is named here.
- **Wrong workflow:** select the intended role and explicitly name the workflow if role metadata is unavailable.
- **Unexpected prompts:** the shared default is deliberately `always-ask`; the author's `yolo` setting is opt-in.

Verified with OMP `18.12.6`: installation into a temporary named profile, configuration loading, RPC startup with the `CODE` role, discovery of all ten named specialists (including Argon), and loading of the shared `RULES.md`. YAML parsing, specialist tool restrictions, local README links, and the Git publication allowlist were also checked. No model inference requests were made; provider authentication and successful specialist dispatch must be verified with your own account access.

## Plugin migration design (not implemented)

The recommended conversion is **one native OMP plugin with four selectable workflows**, rather than four separately installed plugins. This keeps shared policies, specialist definitions, and workflow state in one place.

### Proposed user experience

After the conversion is implemented and published, users would be able to install directly from this GitHub repository without an npm release:

```sh
# Planned installation command; not supported by this repository yet.
omp plugin install github:jarcur1/OMFiles
```

The extension would register these proposed commands:

```text
/workflow normal
/workflow deep
/workflow cyber
/workflow code
/workflow status
```

Selecting a workflow would set explicit session state, not infer a mode from the manager's model. This matters because Deep, Cyber, and Code currently share the same manager selector. A workflow could optionally select its configured manager model without changing the user's persistent configuration.

### Required repository changes

1. Add a `package.json` with a package name, version, and native `omp` manifest. A configuration-only plugin can use `omp: {}`; the selectable-workflow version must declare its extension entrypoint in `omp.extensions`.
2. Keep the ten specialist definitions in `agents/`, where native plugin discovery can load them.
3. Split `RULES.md` into shared policies and four workflow instruction assets. Place static, always-applied policies under `rules/` with YAML frontmatter `alwaysApply: true`. A plugin's root `RULES.md` is **not** automatically loaded as a sticky rule.
4. Implement one extension that registers the workflow commands and injects only the selected workflow's instructions alongside the shared policies. Manager-specific instructions must not be injected into specialist sessions.
5. Extend the publication allowlist in `.gitignore` for the manifest, extension source, `rules/`, and workflow assets.
6. Update installation, migration, update, and removal instructions once the plugin is implemented and verified. Until then, the existing manual installation remains the supported path.

### Extension behavior and boundaries

- Use `pi.registerCommand` for workflow selection and status. Mode transitions should wait for an idle manager session, and a failed model selection must not leave the workflow and model in inconsistent states.
- Use `before_agent_start` to prepare the selected workflow's prompt policy while preserving OMP's base prompt and other applicable policies. Switching modes must replace the previous workflow instructions rather than accumulate conflicting mode prompts.
- Persist the selected workflow with a namespaced `pi.appendEntry` record and reconstruct it from the current session branch on startup, resume, session switching, and branch navigation.
- Scope manager behavior with `ctx.agent.kind`; extension factories also bind to subagent sessions. Keep each specialist's existing role and tool restrictions intact.
- Make model mappings configurable. Resolve selectors with `ctx.models` and switch the manager with `pi.setModel` only when requested. Finding a catalog entry is not proof that a provider request will succeed.
- Keep credentials and provider access user-managed. Merely bundling `config.yml` or `models.yml` does not apply those settings; retain the examples as opt-in setup guidance rather than silently overwrite personal files.
- Preserve the user's approval settings, including computer prompts. Installing or selecting a workflow must not enable `yolo`, grant new authority, or authorize external actions.

### Migrating existing manual installations

Before enabling a future plugin release, back up your installed configuration and identify copies of this pack's `RULES.md` and agent files. User/project agent definitions can override same-name plugin agents, and manually installed rules can remain active alongside plugin rules. Merge personal changes and retire only the old OMFiles content you intend to replace; do not delete unrelated configuration.

Test a fresh profile first. Verify agent discovery, command registration, each workflow selection, prompt replacement across switches, state restoration, unavailable-model handling, and preservation of approval settings. Actual model dispatch requires the user's own provider authentication and quota.

### Feasibility evidence and references

Temporary-package checks with OMP `18.18.2` confirmed native plugin discovery of all ten agents, an always-applied rule under `rules/`, and an extension-registered slash command. A separate passive-plugin check confirmed that `omp: {}` can load conventional rules without extension code, while root `RULES.md` and root `config.yml` are not automatically applied. Those temporary packages and profiles were removed; these checks did not implement workflow switching in OMFiles or make model inference requests.

Primary OMP documentation:

- [Plugin packaging, Git installation, and discovery](https://github.com/can1357/oh-my-pi/blob/main/docs/plugin-manager-installer-plumbing.md)
- [Extension commands, prompt hooks, model selection, and session state](https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md)
- [Rule discovery and always-apply behavior](https://github.com/can1357/oh-my-pi/blob/main/docs/rulebook-matching-pipeline.md)

## Updating and sharing safely

Run `git pull` in your clone, review the changes, and merge them into your installed profile. Installation is a copy, not an automatic link: pulling the repository does not update installed files. Back up your own customizations first.

The shared copies normalize the Argon definition's frontmatter, align `sol-expert` with the documented Sol 6.1 selector, and make `cyber-red` read-only to match the global permissions. The author's live configuration is not modified by this repository.

Do not contribute API keys, authentication data, personal `config.yml` files, session history, databases, logs, browser profiles, caches, backups, or unrelated project files. The repository `.gitignore` allows only the intended public files; it cannot protect secrets pasted into an allowed file. Review every contribution before publishing.

## License

[MIT](LICENSE).
