# Local AI

A local AI assistant for the terminal, powered by [Ollama](https://ollama.com). Runs fully offline — no API keys, no cloud, no data leaving your machine.

## Features

- Multi-turn conversations with persistent history
- Live streaming responses
- Markdown rendering in the terminal
- Tool access — the AI can read files, list directories, and run shell commands
- Configurable model, user name, and system prompt
- Safe shell execution (dangerous commands are blocked)

## Requirements

- [Bun](https://bun.sh) v1.3.11+
- [Ollama](https://ollama.com) running locally

## Installation

### Option A — Run from source

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Clone and install
git clone <repo-url> local-ai
cd local-ai
bun install

# Run
bun run start
```

To install as a global command:

```bash
bun install -g .
local-ai
```

### Option B — Compiled binary (no Bun required)

Download the latest binary from [Releases](#), then:

```bash
chmod +x local-ai
mv local-ai ~/.local/bin/
local-ai
```

Or build it yourself:

```bash
bun run build          # current platform
bun run build:linux-x64
bun run build:linux-arm64
# output: dist/local-ai
```

## Setup

```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Start Ollama
ollama serve

# 3. Pull a model
ollama pull gemma4:latest

# 4. Run — config is created automatically on first launch
local-ai
```

## Configuration

On first run, a config file is created at `~/.config/local-ai/config.json`:

```json
{
  "user": {
    "name": "User"
  },
  "ollama": {
    "host": "http://localhost:11434/api",
    "model": "gemma4:latest"
  },
  "chat": {
    "maxSteps": 5,
    "dbPath": "/home/you/.local/share/local-ai/chat.db"
  }
}
```

| Field | Description |
|---|---|
| `user.name` | Your name — used in the assistant's system prompt |
| `ollama.host` | Ollama server URL |
| `ollama.model` | Model to use (must be pulled via `ollama pull`) |
| `chat.maxSteps` | Max tool-use steps per response (default: 5) |
| `chat.dbPath` | Path to the conversation database |
| `chat.systemPrompt` | Optional — fully overrides the default system prompt |

Environment variables take priority over the config file:

```bash
OLLAMA_HOST=http://192.168.1.10:11434/api local-ai
OLLAMA_MODEL=llama3.2 local-ai
DB_PATH=/tmp/chat.db local-ai
```

## Commands

| Command | Description |
|---|---|
| `/help` | Show available commands |
| `/config` | Show active configuration |
| `/new` | Start a fresh conversation |
| `/clear` | Clear the screen |
| `exit` | Quit |

## Development

```bash
bun run dev    # watch mode, auto-restarts on file changes
bun run start  # run once
bun run build  # compile to a standalone binary
```

## License

MIT
