# Running this on your own PC

The cloud session this project was built in cannot reach games-media sites —
its network policy blocks them — and cannot see files on your machine. Running
Claude Code locally removes both limits at once: your files, your network, no
uploads.

## Install

Claude Code runs as a CLI, a desktop app for Mac and Windows, and as VS Code
and JetBrains extensions. The native installer is the recommended route and
needs no Node.js.

**Windows — PowerShell:**

```powershell
irm https://claude.ai/install.ps1 | iex
```

Then close and reopen the terminal so the PATH change takes effect, and check
with `claude --version`.

**If `claude` is not recognised**, the install worked but the shell cannot find
it. The installer prints the location — by default
`C:\Users\<you>\.local\bin\claude.exe`. You can always run it by full path,
which needs no PATH set up at all:

```powershell
& "$env:USERPROFILE\.local\bin\claude.exe" --version
```

To fix it properly, you do not need the Environment Variables dialog. To use
it in the window you are already in:

```powershell
$env:Path += ";$env:USERPROFILE\.local\bin"
```

And to make it permanent, so every new terminal finds it:

```powershell
$bin = "$env:USERPROFILE\.local\bin"
$old = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($old -notlike "*$bin*") {
  [Environment]::SetEnvironmentVariable('Path', ($old.TrimEnd(';') + ';' + $bin), 'User')
}
```

That writes to your *user* PATH, so it needs no administrator rights and
cannot damage the system PATH. Close the terminal and open a new one before
testing — a PATH change does not reach a window that is already open.

One thing worth saying plainly: when a command fails, paste only the command
again, never the error text. PowerShell will happily try to execute the error
message line by line, and the resulting wall of unrelated failures hides the
real problem.

Two things that trip people up here. `install.cmd` is a **cmd.exe** script —
running it from PowerShell fails, because PowerShell 5.1 does not accept `&&`
as a statement separator and aliases `curl` to `Invoke-WebRequest`, so the
curl flags are not understood either. Use the `.ps1` line above in PowerShell,
or open Command Prompt if you want the `.cmd` route. And if PowerShell refuses
to run the script at all:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Mac or Linux:**

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**No terminal at all:** the desktop app at <https://claude.ai/download>
installs like any other program.

**Already have Node.js:** `npm install -g @anthropic-ai/claude-code` also
works and is fully supported.

Either way, then `claude login`. It needs a paid plan — Pro, Max, Team or
Enterprise.

## Get the project

Work somewhere sensible — not `C:\Windows\system32`, which is where
PowerShell opens by default and where you do not want to be writing files:

```powershell
mkdir $env:USERPROFILE\projects -Force
cd $env:USERPROFILE\projects
git clone https://github.com/nullemon/daaaawnwalkkkkerrr.git
cd daaaawnwalkkkkerrr
git checkout claude/gallant-sagan-h66nua
```

You also need **Node.js 20.9+** and **pnpm**. Check what you have:

```powershell
node --version    # want v20.9 or newer
git --version
```

Missing either, the quickest route on Windows 10/11:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

Then reopen the terminal and `npm install -g pnpm`.

Do not use npm to install *this project* — see the gotchas in `CLAUDE.md`.
pnpm is only needed for the project's own dependencies; installing pnpm itself
with npm is fine.

```bash
pnpm install
cp .env.example .env          # then set PAYLOAD_SECRET
pnpm seed && pnpm import
pnpm dev                      # http://localhost:3000
```

Then run `claude` in that folder. It reads `CLAUDE.md` automatically, so it
starts with the whole project in hand — no re-explaining.

## The asset workflow, locally

This is the part that was impossible from the cloud.

**1. Put your images anywhere** and tell Claude where. It can read them
directly, look at them, and sort them. No uploading, no zipping.

**2. Or drop them straight in** as `assets/<collection>/<slug>.<ext>`:

```
assets/items/durandal.png
assets/characters/lacra.jpg
```

then `pnpm assets`. Matching is forgiving about capitals, spaces and
apostrophes. Anything that matches no record is reported, not dropped.

**3. For a pile of extracted game files**, do not rename by hand:

```bash
pnpm assets:match "C:\FModel\Output\Exports"          # dry run, writes a plan
pnpm assets:match "C:\FModel\Output\Exports" --apply  # stage into assets/
pnpm assets                                           # attach to records
```

**4. For the official art** — press kits, Steam — a local session can simply
download it. That is what the cloud session was blocked from doing.

## What to ask it to do first

Good opening prompts, roughly in order of value:

- *"Read CLAUDE.md and docs/ASSETS.md, then download the official press art
  from the sources in docs/ASSETS.md and attach it."*
- *"I have images in `C:\Users\me\Downloads\dawnwalker`. Sort them into
  `assets/` with the right slugs, then run `pnpm assets`."*
- *"Help me set up FModel and extract the UI icons"* — it can walk you through
  it and handle everything after the export.
- *"Deploy this"* — see the deploy section of the README.

## Keeping both sides in sync

Commit and push from your machine and the work is shared:

```bash
git add -A
git commit -m "Add official press art"
git push origin claude/gallant-sagan-h66nua
```

Images are gitignored on purpose — large, and not ours to redistribute — so
they stay on your machine and in whatever you deploy to. Everything else
travels.
