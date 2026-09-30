# Clarko Helper

A writing editor with an AI co-author, **Clarko**. You write on the left; Clarko mirrors your document on the right and helps with next-word suggestions, rewrites of selected text, insights on a paragraph, and search across the document.

The repository has two parts:

| Folder | What it is | Built with |
| --- | --- | --- |
| `Front/clarko-helper` | The editor (web app) | React 19, TypeScript, Vite, Tiptap |
| `API/Clarko-API` | The API the editor calls; it talks to the AI through OpenRouter | ASP.NET Core (.NET 9), Refit |

## Requirements

Install these before you start:

- **[.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0)**, for the API. Check with `dotnet --list-sdks`.
- **[Node.js](https://nodejs.org/) 20.19 or newer (or 22.12 or newer)**, which includes npm, for the editor. Check with `node -v`.
- **An [OpenRouter](https://openrouter.ai/) account and API key.** The AI features run on OpenRouter models.
  - The default models (`openai/gpt-4o-mini`, `openai/gpt-4o`) are paid, so the account needs **credits**. A free-tier account gets `402 Payment Required`, which the editor shows as *"The AI budget for this demo is used up"*. To run without credits, set the models in `appsettings.json` to OpenRouter models whose names end in `:free`.

## Setup

### 1. Get the code

```bash
git clone https://github.com/israelljunnior/Clarko-Helper.git
cd Clarko-Helper
```

### 2. Set your OpenRouter API key

Open `API/Clarko-API/Clarko-API/appsettings.json` and put your key in `OpenRouter:ApiKey`:

```json
"OpenRouter": {
  "BaseUrl": "https://openrouter.ai/api/v1",
  "ApiKey": "sk-or-v1-your-key-here",
  ...
}
```

The API **won't start** without a key: it stops at startup with *"OpenRouter:ApiKey is missing"*.

> ```bash
> cd API/Clarko-API/Clarko-API
> dotnet user-secrets init --project Clarko-API.csproj
> dotnet user-secrets set "OpenRouter:ApiKey" "sk-or-v1-your-key-here" --project Clarko-API.csproj
> ```

### 3. Optional settings

All in `API/Clarko-API/Clarko-API/appsettings.json`:

| Setting | Default | What it does |
| --- | --- | --- |
| `OpenRouter:SuggestionModel` | `openai/gpt-4o-mini` | Next-word suggestions |
| `OpenRouter:SelectionModel` | `openai/gpt-4o` | Rewrites of selected text |
| `OpenRouter:ChatModel` | `openai/gpt-4o-mini` | Clarko's insights (streamed chat) |
| `OpenRouter:SearchModel` | `openai/gpt-4o-mini` | Finding related content when a search has no exact match |
| `TokenBudget:LimitUsd` | `5.00` | The most the app may spend in total; the header shows spend against it |
| `Cors:AllowedOrigins` | `http://localhost:5173` | Where the editor runs; the API only accepts calls from here |

## Running

Start the **API first**, then the editor, each in its own terminal.

### API

```bash
cd API/Clarko-API/Clarko-API
dotnet run --project Clarko-API.csproj --launch-profile http
```

The API listens on **http://localhost:5294**. `--project Clarko-API.csproj` is needed because the folder holds more than one project file.

In Visual Studio, you can instead open `API/Clarko-API/Clarko-API.slnx` and run the **http** profile.

### Editor

```bash
cd Front/clarko-helper
npm install
npm run dev
```

The editor opens in your default browser at **http://localhost:5173**. `npm install` is only needed the first time, or after the dependencies change.

The editor must run on port 5173, the address the API allows. If that port is busy, `npm run dev` stops with an error instead of switching to another port; close whatever is using it and run the command again.

### Ports at a glance

| Part | Address | Configured in |
| --- | --- | --- |
| API | http://localhost:5294 | `API/Clarko-API/Clarko-API/Properties/launchSettings.json` |
| Editor | http://localhost:5173 | `Front/clarko-helper/vite.config.ts` |
| API address used by the editor | http://localhost:5294 | `Front/clarko-helper/src/environments/environment.ts` |

If you change the API's port, change it in `environment.ts` too. If you change the editor's port, add it to `Cors:AllowedOrigins`.

## Troubleshooting

| You see | Likely cause |
| --- | --- |
| *"Couldn't reach the Clarko API at http://localhost:5294. Is it running?"* | The API isn't running, or runs on another port. |
| *"The AI budget for this demo is used up"* | The OpenRouter account has no credits for the chosen model, or `TokenBudget:LimitUsd` was reached. |
| The API stops at startup with *"OpenRouter:ApiKey is missing"* | The key isn't set (see step 2). |
| `npm run dev` says port 5173 is in use | Another app, or another copy of the editor, uses the port. |
