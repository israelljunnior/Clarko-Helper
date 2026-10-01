# AI session: building Clarko-helper with Claude

- **Tool:** Claude (claude.ai chat, Claude Opus 5.5) with code execution and web search
- **Project:** Clarko-helper, a collaborative AI Markdown editor for the Chiri Engineering Assessment
- **Date:** September 2026

> This file was exported by Claude from the conversation itself. User messages and Claude's replies are reproduced as written. Tool activity (reading files, running builds, web searches) is summarized in *Tool activity* notes instead of raw output, and generated code is referenced by file path because it lives in the repository. Screenshots shared during the session are in `images/`.

---

## 1. Ground rules

**User:**
I need to build a project for a hiring processing and i need your help i'm gonna give you file with the whole ideia but I don't you want to build any thing yet. thoughout the conversation you gonna do until i ask you to do. okay ?

**Claude:**
Okay, got it. I won't build anything until you tell me to.

Send the file whenever you're ready. I'll read it, and we can go through the idea together: architecture, stack choices, scope, and anything that seems unclear or risky for a hiring-process project. I'll hold off on any code or files until you say "go."

---

## 2. Reading the assessment brief

**User:** *(uploaded `Engineering_Assessment_2026.pdf`, the Chiri brief: build a browser-based collaborative AI Markdown editor with visible diffs, accept/reject/refine, using an OpenRouter key with a $5 cap; submit code, a README and the AI session transcript)*

**Claude:**
I've read it. Nothing gets built until you say so. Here's my take.

**What they're really testing**

The feature list is small on purpose. The evaluation leans toward taste, judgment, and how you work with AI, not the number of features. Three points stand out:

- **"Not a chatbot in a sidebar and not something that completes the whole document."** This is the core design constraint. The AI should act on the text in place, preferably on a selection or a section, and propose changes the user can inspect.
- **Diffs are the product.** Suggestions must be visible, granular, and easy to accept, reject, or refine. If the diff experience is excellent, most of the rest can be simple.
- **The AI transcript is mandatory and gets reviewed.** This conversation will likely be part of what they read. That's a reason to keep our planning deliberate and our decisions explicit, because they're looking for reasoning, not just output.

**The shape I'd suggest**

A frontend with a Tiptap-based editor, where the user selects text (or the cursor sits in a paragraph) and triggers an AI action. That could be slash commands, a small floating toolbar, or a free-text instruction like "make this more formal." The AI's answer would appear as inline tracked changes inside the document, with deletions struck through and insertions highlighted. Each change could be accepted or rejected individually or all at once. A "refine" input on the pending suggestion would keep the multi-turn loop tied to the text rather than to a chat history.

On the backend, I'd argue for a very small proxy rather than none. Calling OpenRouter directly from the browser would expose the API key in client code, and even with a $5 cap, a reviewer will notice that. Given your background, a minimal ASP.NET Core API with one or two endpoints that stream the model's response would be quick for you and easy to defend. It's also consistent with their "no unnecessary infrastructure" rule: no database, no auth, no Docker.

For the frontend, you're strongest in Angular, and Tiptap has Angular wrappers. However, most Tiptap examples and extensions are React-first, which could cost you time in a 4–6 hour budget. That's the main trade-off to decide early.

**Things worth deciding before any code**

- How suggestions get computed. The two options are asking the model for a full rewrite of the selection and diffing it on the client, or asking for structured edit operations. Client-side diffing is more reliable and usually the better call.
- Word-level versus sentence-level diffs. This choice has a big effect on readability.
- What you intentionally leave out, such as version history or real-time multi-user editing. They explicitly reward saying no, so the README should list those decisions.

Which frontend do you want to go with: Angular to stay in your comfort zone, or React to get the smoother Tiptap path?

---

## 3. State management: Redux or not

**User:**
Can i combine tiptap with redux ?

**Claude:**
Yes, Tiptap and Redux work together, but only if they each own a different kind of state. Trying to make Redux the single source of truth for the document is where people run into trouble.

**The main rule: Tiptap owns the document**

Tiptap is built on ProseMirror, which has its own immutable state, transaction system, selection model, and undo history. If you mirror the whole document into Redux on every keystroke and try to drive the editor from the store, you get two sources of truth, extra re-renders, cursor jumps, and broken undo. Let the editor instance be authoritative for content and selection, and read from it when you need to (for example, `editor.getText()` or the current selection when firing an AI request).

**What Redux is good for here**

The AI workflow state lives outside the document:

- Pending suggestions: id, the target range, original text, proposed text, and status (pending, accepted, rejected).
- Request lifecycle: streaming, error, cancelled.
- The refinement thread for each suggestion ("shorter" → "now more formal").
- UI state, such as which suggestion is focused or whether the command palette is open.

The tricky part is the connection between the two. A suggestion's position in the document shifts as the user keeps typing. That mapping belongs in ProseMirror, either as decorations or as a custom mark or extension that tracks the range, while Redux stores the suggestion's metadata keyed by id. When the user accepts, you dispatch to Redux and run an editor transaction that replaces the range.

**Should you use Redux at all?**

This is worth thinking about given how they grade. The app's global state is small: a list of suggestions plus request status. Redux Toolkit is fine and familiar, but a reviewer looking at "taste and judgment" might see it as heavier than needed for a single-page, 4–6 hour project. `useReducer` plus context, or Zustand, would cover the same needs with less ceremony. If you do go with Redux, use Redux Toolkit, and put a line in the README explaining why. For example, suggestions have a real lifecycle, and having them in one reducer keeps accept, reject, and refine predictable and easy to test. A justified choice reads well. An unexplained one reads like habit.

Do you already have a reason to prefer Redux, like the team at Chiri using it, or is it just what you're most comfortable with in React?

**User:**
I'll use without redux

**Claude:**
Good call. It keeps the stack lean, and it's an easy decision to defend in the README.

Here's how the state would split without Redux. Tiptap still owns the document, content, and selection, along with a small extension that tracks where each suggestion sits as the text changes. On the React side, a `useReducer` handles the suggestion lifecycle: create, stream in, accept, reject, refine. It lives in one custom hook, something like `useSuggestions`, and is shared through a context if more than one component needs it. You keep the predictable, testable reducer pattern you'd have gotten from Redux, just without the library.

If sharing that state through context gets awkward, Zustand is the fallback, but I'd expect `useReducer` to be enough at this scale.

I've noted "no Redux, `useReducer` + Tiptap as source of truth" as a decision for the README. Next up is probably the backend proxy: do you want to go with the small ASP.NET Core API, or keep everything in Node alongside the frontend?

---

## 4. Scaffolding the React project

**User:** *(screenshot of the Vite "Select a framework" prompt)*
I'm creating the react project with tiptap what is this:

![Vite framework prompt](images/01.png)

**Claude:**
That's the Vite scaffolding prompt (`npm create vite@latest`) asking which framework template to use. Only the first options are showing; the "..." means there are more below.

Press the down arrow until **React** is highlighted, then press Enter. Vite will then ask for a variant. Pick **TypeScript** (or **TypeScript + SWC**, which compiles a bit faster; either is fine). TypeScript is worth it here because Tiptap's editor API and your suggestion state are much easier to work with typed, and it reads better to reviewers.

Once it's created, run `npm install` inside the project folder. Tiptap gets added separately afterward with its own packages (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`). It isn't part of the Vite template.

**User:**
i have two options typescript and typescript + react compiler

**Claude:**
Pick plain **TypeScript**.

The "TypeScript + React Compiler" option adds the React Compiler, a Babel plugin that automatically memoizes your components and hooks. It works well in ordinary React code, but it assumes you follow React's rules strictly, like never mutating objects during render. Tiptap hands you a mutable `editor` instance that changes outside React's knowledge. That combination can cause subtle issues, like components not re-rendering when the editor state changes, and those are painful to debug when you only have a few hours.

At this app's size, the performance gain wouldn't be noticeable. Plain TypeScript keeps things predictable, and you can mention in the README that you skipped the compiler on purpose.

**User:**
now oxlint or eslint

**Claude:**
Go with **ESLint**.

Oxlint's main selling point is speed, since it's written in Rust and runs many times faster. That matters in large codebases, but in a small project ESLint already runs in about a second, so you wouldn't notice the difference.

ESLint gives you the full `eslint-plugin-react-hooks` rules, and those catch the kind of bugs you're likely to hit here. The `exhaustive-deps` rule, for example, flags stale closures in effects that listen to Tiptap editor events or handle streaming responses. Oxlint covers many of these rules but not all of them. ESLint is also what reviewers expect to see, so it adds nothing to explain.

**User:**
how to run the project w

**Claude:**
From the terminal, go into the project folder, install the dependencies, and start the dev server:

```bash
cd your-project-name
npm install
npm run dev
```

Vite will print a local address, usually `http://localhost:5173`. Open it in your browser and you should see the default React starter page. The dev server reloads automatically as you edit files. Press `Ctrl + C` in the terminal to stop it.

---

## 5. Fixing errors from the Tiptap example code

**User:** *(screenshot: `Cannot find module '@tiptap/extension-text-align'`)*
I'm getting this error

![Missing module error](images/02.png)

**Claude:**
That error means the package isn't installed. You copied code from a Tiptap example, and the example uses extensions that aren't part of the core packages. Install the missing ones:

```bash
npm install @tiptap/extension-text-align @tiptap/extension-highlight
```

A few other things in that snippet will break next:

- **`import './styles.scss'`** needs Sass. Either run `npm install -D sass`, or rename the file to `styles.css` if it doesn't use any SCSS syntax.
- **`({ editor })` is underlined** because TypeScript doesn't know its type. Change it to `({ editor }: { editor: Editor })` and add `import type { Editor } from '@tiptap/react'`.
- **`import React from 'react'`** can be removed. The Vite React template doesn't need it, which is why it's greyed out.

It's also worth questioning whether you need TextAlign at all. Markdown has no syntax for text alignment, so anything the user aligns would be lost when the document is saved or exported as Markdown. Dropping it keeps the editor aligned with the assessment's "user writes Markdown" requirement, and that's the kind of deliberate cut reviewers look for. Highlight has the same issue in standard Markdown, but you may want a highlight-style mark later to show AI suggestions, so it's fine to keep.

**User:** *(screenshot: `Binding element 'editor' implicitly has an 'any' type`)*
now here:

![Implicit any error](images/03.png)

**Claude:**
TypeScript needs to know what `editor` is. Import the type and annotate the parameter:

```tsx
import type { Editor } from '@tiptap/react'

const MenuBar = ({ editor }: { editor: Editor }) => {
```

If `MenuBar` is rendered before the editor is ready, `useEditor` can briefly return `null`. In that case, use `{ editor: Editor | null }` and add `if (!editor) return null` at the top of the component.

---

## 6. Designing the collaborative layout

**User:**
i want to build my edit with a layout like this colaborative one: https://tiptap.dev/docs/examples/advanced/collaborative-editing where the second will always be the IA give small suggetions

> *Tool activity:* Claude fetched the Tiptap collaborative-editing example page.

**Claude:**
I looked at that example. The demo connects every client to a WebSocket server and merges document changes using Y.js, and shows two editors side by side, each acting as a separate user with a live cursor. The layout is a good idea for your app. The technology behind it is not what you need.

**Take the layout, skip Yjs**

Yjs and a WebSocket server exist to merge edits from several people on different machines. You'd have one human and one AI in the same browser tab, so there's nothing to sync over a network. Adding that stack would be the kind of infrastructure the assessment says not to add, and it would take a big chunk of your time. You can get the same side-by-side feel with two Tiptap instances in one React page.

**How the two panes should behave**

This is where the design choice matters most. If the right pane were the AI's own editable copy of the document, you'd have two diverging documents and the user would lose track of which is real. That conflicts with "the user is always in control."

A better model:

- **Left pane: the real document.** The user writes here. It's the only source of truth.
- **Right pane: the AI co-author's view.** It shows the same document read-only, with the AI's small proposed edits rendered as tracked changes: strikethrough for removals and highlights for insertions, aligned to the paragraph they apply to. Each suggestion has accept and reject buttons. Accepting applies the change to the left pane.

The collaborative feel comes from small details borrowed from the demo. The AI gets a named, colored presence, like "Co-author" with its own color, and a label shows which paragraph it's currently reading or working on.

**One cost warning about "always giving suggestions"**

If the AI suggests continuously, it needs a trigger. The usual approach is to wait until the user stops typing for a second or two, then send only the paragraph they just edited. That keeps suggestions small, which matches your idea and the "don't complete the whole document" rule, and keeps token use low enough for the $5 cap. Sending the whole document on every pause would drain the budget quickly.

Do you want the AI to suggest automatically as the user pauses, or only when the user asks? You could also do both: automatic small fixes, plus an on-demand "rewrite this" for bigger changes.

**User:**
yes pauses for a second and a half:
I'm imagining a scenario with two helps
one auto complete in this collaborative and another opens a pop up with suggestion to select
accept, reject, or refine(this refine gives another suggestion for the selected part):
let's go step by step first let's go this collaborative component

**Claude:**
Good, two distinct helps with clear jobs:

1. **Collaborative pane**: after a 1.5 second pause, the AI proposes something small for the paragraph you're in.
2. **Selection popup**: you select text, and a popup offers a suggestion with accept, reject, and refine. Refine generates a new version for the same selection.

That split works well. The first feels like a co-author watching over your shoulder, and the second is you directing it. Here's how I'd design the collaborative component before any code.

**Layout**

A header shows the two "participants": *You* and *Co-author*, each with a color dot, plus a status for the AI (idle, reading paragraph 3, suggesting). The left pane is your Tiptap editor and the only real document. The right pane is a read-only mirror of the same document where the AI's suggestion appears inline as a diff, with Accept and Reject buttons next to it.

**The 1.5 second trigger**

- Wait 1.5 seconds after the last keystroke, then take only the paragraph that contains the cursor.
- Skip the request if that paragraph hasn't changed since the last one, is very short (a few words), or the user has text selected (the popup handles that case).
- If the user starts typing again while a request is running, cancel it. If the paragraph changes after a suggestion arrives, drop the suggestion as outdated, so you never apply an edit to text that no longer exists.
- Keep one active suggestion at a time. Several at once would feel noisy.

**Accepting**

Buttons in the right pane, plus `Tab` to accept and `Esc` to dismiss while typing in the left pane. That's the familiar autocomplete convention, so reviewers won't need to read docs to use it.

**Build order**

I'd build the UI with a mocked AI first: a fake function that returns a small edit after a short delay. That way we can get the layout, trigger, and diff rendering right without spending API budget, then plug in the real backend afterward.

The one thing to settle before I write code: by "autocomplete," do you mean the AI **continues** the sentence you're writing (like Copilot), or that it **improves** the paragraph you just wrote (grammar, clarity, wording) and shows the change as a diff? The brief rewards diffs and warns against completing the document, so improvements fit better, but continuation could work if it's kept to a few words. Once you pick one, say the word and I'll start building.

---

## 7. Building the collaborative component (mocked AI)

**User:** *(screenshot of a macOS-style writing app with a purple gradient wallpaper, monospace text, "Untitled — Edited" title and a word/character/line count footer)*
let's build but this mocked AI must be based on the openrouter response format and also create a service to built. The name of this project is Clarko-helper and create only classes needed. try to mock this layout for the editor

![Layout reference](images/04.png)

> *Tool activity:* Claude read the frontend-design skill, scaffolded a matching Vite + React + TypeScript project in its sandbox, installed `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit` and `diff`, wrote the files below, then ran `tsc -b`, `vite build`, ESLint with the React Hooks rules, and a script that ran the mock through the service. All passed.
>
> Files created: `src/services/openRouterClient.ts`, `src/services/mockOpenRouterClient.ts`, `src/services/suggestionService.ts`, `src/hooks/useCoAuthor.ts`, `src/components/EditorWindow.tsx`, `src/components/CoAuthorPane.tsx`, `src/App.tsx`, `src/index.css`.

**Claude:**
Here's the first step of Clarko-helper: the collaborative pane with a mocked AI. The files are below. I verified them in a matching Vite + React + TypeScript project: they type-check, build, and pass ESLint with the React Hooks rules.

**To drop it into your project**

1. Install the diff library: `npm install diff`.
2. Copy the files into your `src/` folder, replacing `App.tsx`, `main.tsx` and `index.css`.
3. Delete `App.css` and the Tiptap sample component with the `MenuBar`, since they're no longer used.
4. Run `npm run dev`.

The editor opens with a sample paragraph full of small mistakes. Type anything in it, pause for 1.5 seconds, and the Co-author pane will show a diff you can accept with `Tab` or reject with `Esc`.

**How it's organized (only what's needed)**

- **`services/openRouterClient.ts`** has the request and response types matching OpenRouter's chat completion format, plus an `OpenRouterClient` interface.
- **`services/mockOpenRouterClient.ts`** is a class implementing that interface. It returns a real OpenRouter-shaped response (`id`, `choices[0].message.content`, `usage`, etc.) with simulated latency, supports cancellation, and applies simple rules like spelling, contractions, and spacing.
- **`services/suggestionService.ts`** owns the prompt and the JSON response contract (`{ revised, reason }`). It doesn't know whether it's talking to the mock or the real API. When the backend proxy is ready, you'll add one more class implementing `OpenRouterClient`, and nothing else changes.
- **`hooks/useCoAuthor.ts`** handles the pause trigger, cancelling requests when you keep typing, dropping outdated suggestions, and accept/reject, all with `useReducer`, as we decided.
- **`components/EditorWindow.tsx`** and **`CoAuthorPane.tsx`** make up the macOS-style window from your screenshot, with the "You" and "Co-author" presences and the footer word count.

**Decisions I made that you should know about**

- You didn't answer the continue-vs-improve question, so I went with **improve**. The AI rewrites the paragraph you're in and shows the change as a diff. That fits the brief better. It's easy to change if you want continuation instead.
- The AI only reviews top-level paragraphs and headings. It skips lists, quotes, and code blocks, because replacing their text naively would break their structure.
- Accepting a suggestion replaces the paragraph's plain text, so inline formatting like **bold** inside that paragraph is lost. This is worth listing in the README as a known limitation.

Next steps would be the selection popup (accept, reject, refine), or the backend proxy so the real model can replace the mock. Which do you want to do first?

**User:** *(screenshot of leftover imports `TiptapCollabProvider` from `@hocuspocus/provider`, `yjs`, and `./Editor.jsx`)*
i'm getting this error:

![Leftover collaboration imports](images/05.png)

**Claude:**
Those red underlines mean the packages aren't installed. But the better fix is to delete this file rather than install them.

That code is from Tiptap's collaborative-editing demo. `TiptapCollabProvider` connects to Tiptap's cloud collaboration service (that's what the `appId` is for), and `yjs` merges edits between users on different machines. Clarko-helper doesn't use either: the Co-author pane is local React state, with no sync server. Installing them would bring in exactly the infrastructure we decided to skip, plus a dependency on an external account a reviewer wouldn't have.

So:

1. Delete this file, and the `Editor.jsx` it imports if that's also from the demo.
2. Make sure `App.tsx` is the version I sent, which only imports `EditorWindow`.
3. Run `npm run dev` again.

If other leftover demo files are still in `src/`, remove them too. Any imports of `@hocuspocus/*`, `yjs`, or `@tiptap/extension-collaboration*` are signs they came from that example.

---

## 8. Building the selection popup

**User:**
now let's to the popups selection events

> *Tool activity:* Claude inspected Tiptap v3's `BubbleMenu` API in `node_modules` (props, `shouldShow`, blur handling, Floating UI options), extended the mock and service for multi-turn refinement, added the popup and its hook, extracted a shared diff component, then re-ran type-check, build, ESLint, and a script testing "improve" → "more casual" → "more formal" through the mock. A casing bug in one mock rule was found by that test and fixed.
>
> Files created: `src/components/SelectionPopup.tsx`, `src/hooks/useSelectionEdit.ts`, `src/components/DiffText.tsx`. Files updated: `CoAuthorPane.tsx`, `EditorWindow.tsx`, `suggestionService.ts`, `mockOpenRouterClient.ts`, `index.css`.

**Claude:**
The selection popup is done. It type-checks, builds, and passes ESLint, and I tested multi-turn refinement through the mock ("improve" → "more casual" → "more formal", with each step building on the previous version).

**Setup**

Run `npm install @floating-ui/dom`, which Tiptap's popup menu needs for positioning. Then copy in the files below. There are two new files (`SelectionPopup.tsx`, `useSelectionEdit.ts`, plus the shared `DiffText.tsx`), and the rest are updated.

**How it works**

1. Select text inside a paragraph, and a popup appears below it with quick actions (Improve, Shorter, More formal, More casual) and a text field for your own instruction.
2. After you choose, the popup shows the diff for just the selected text, a short reason, and Accept (`Enter`) or Reject (`Esc`).
3. To refine, type something like "shorter" or "add an example" and press Enter, or click **Try another** with the field empty to get a different version. Each refinement builds on the latest version and is labeled "Version 2", "Version 3", and so on. This covers the brief's multi-turn refinement idea.

**Decisions worth knowing**

- **Nothing is sent to the AI just because you selected text.** You choose an action first. People select text to copy or format all the time, and automatic requests would waste the $5 budget and feel intrusive.
- **Refinement replays the conversation.** Earlier instructions and versions are sent back as chat turns, so "more formal" applies to the shorter version, not the original. The service owns this; the UI just keeps the list of steps.
- **The popup closes if the selection or document changes**, and Accept double-checks that the text is still what the AI saw. That's the same protection as in the co-author pane.
- **Reject keeps your selection**, so you can immediately try a different action.
- `DiffText` is now shared by both flows, so diffs look the same everywhere.

**Current limitation:** selections must stay within one paragraph or heading. Multi-paragraph rewrites ("restructure this section") need more careful replacement logic. That's a good README item, or a later step if there's time.

The next piece is the backend proxy, so the real OpenRouter model replaces the mock. Since the service only depends on the `OpenRouterClient` interface, it's one new class on the frontend plus the proxy itself. Do you want the proxy in ASP.NET Core or Node?

**User:**
which directory should i put the difftext and selectionoppen

**Claude:**
Both go in `src/components/`, next to `EditorWindow.tsx` and `CoAuthorPane.tsx`:

```
src/
├── components/
│   ├── CoAuthorPane.tsx
│   ├── DiffText.tsx          ← new
│   ├── EditorWindow.tsx
│   └── SelectionPopup.tsx    ← new
├── hooks/
│   ├── useCoAuthor.ts
│   └── useSelectionEdit.ts   ← new
├── services/
│   ├── mockOpenRouterClient.ts
│   ├── openRouterClient.ts
│   └── suggestionService.ts
├── App.tsx
├── index.css
└── main.tsx
```

Don't forget `useSelectionEdit.ts` in `src/hooks/`, since `SelectionPopup` imports it. Also replace the updated versions of `CoAuthorPane.tsx`, `EditorWindow.tsx`, `suggestionService.ts`, `mockOpenRouterClient.ts` and `index.css`, or the imports won't match.

**User:**
i made many modification in the file so any modification of in a already existence file just give me which line i should modify instead of the whole file, except if its a totally new one

**Claude:**
Got it. From now on, for files that already exist I'll give you only the changes, anchored to code you can search for (line numbers wouldn't match after your edits). New files will come in full.

*(Claude then listed the targeted edits for `CoAuthorPane.tsx`, `EditorWindow.tsx` and `suggestionService.ts`. The response was cut off partway through the `complete` method of `suggestionService.ts`.)*

**User:**
I don't need more modification now

**Claude:**
Okay, I'll stop here.

One thing to know: my last message was cut off partway through the `complete` method in `suggestionService.ts`. If you apply those changes, take that method from the full `suggestionService.ts` file I sent earlier rather than from the snippet.

When you want to continue, whether with the backend proxy, the README, or something else, just tell me.

---

## 9. Building the proxy API (ASP.NET Core)

**User:**
Now let's go to the proxy api project:
1. Minimal API using refit lib to make http request to the openrouter endpoints
2. Small tokenbudgetcontrolservice where i validate the remaining budget.
3. PromptService where i use it to create the prompt, validate if the prompt is validate and don't has a malicious order to break AI response
4. create appsettings with the api key

these endpoints in a HelperController:
suggestionautocomplete - where I pass the line and gets suggestions for the next word(use GPT-4o-mini);
selectionautocomplete _ where I pass the string paramater of how should i refine the selected part(use GPT-4o)

> *Tool activity:* Claude searched OpenRouter's documentation for the `GET /api/v1/key` response shape (`limit`, `limit_remaining`, `is_free_tier`) and searched for the current `Refit.HttpClientFactory` version (11.1.0). It checked for a .NET SDK in the sandbox (none available, and NuGet is not reachable), so the C# code could not be compiled there. It wrote the project files and tested the prompt-injection regex in Python against benign and malicious instructions, broadening one pattern after "disregard the rules above" slipped through.
>
> Files created: `Clarko.Helper.Api.csproj`, `Program.cs`, `appsettings.json`, `appsettings.Development.json`, `.gitignore`, `Clarko.Helper.Api.http`, `Configuration/OpenRouterOptions.cs`, `Configuration/TokenBudgetOptions.cs`, `OpenRouter/IOpenRouterApi.cs`, `OpenRouter/OpenRouterModels.cs`, `Services/PromptService.cs`, `Services/TokenBudgetControlService.cs`, `Endpoints/HelperEndpoints.cs`, `Endpoints/HelperContracts.cs`.

**Claude:**
The proxy project is ready, and all of these are new files. I couldn't compile it here because this environment has no .NET SDK or NuGet access. Run `dotnet build` on your side and paste any errors; I'll fix them right away.

**Setup**

1. Create the project with `dotnet new web -n Clarko.Helper.Api`, then replace or add the files below, keeping the folders (`Configuration/`, `Endpoints/`, `OpenRouter/`, `Services/`).
2. Put your real key in `appsettings.Development.json`. The `.gitignore` excludes that file. Since the repo will be public for the reviewers, a committed key would be exposed.
3. Run `dotnet run`, check the port in `Properties/launchSettings.json`, and update `@baseUrl` in the `.http` file to match. That file has ready-made requests, including a prompt-injection attempt that should return 400.

**What each part does**

- **Refit client** (`IOpenRouterApi`) calls `POST /chat/completions` and `GET /key`. Snake_case JSON handling and the auth header are configured once in `Program.cs`.
- **`TokenBudgetControlService`** reads the remaining budget from OpenRouter's `GET /key` endpoint, which returns the key's `limit_remaining`. It caches the value for 60 seconds, subtracts each response's reported cost in between, and refuses requests below a $0.25 safety margin, returning a clear 402 message. If the budget check itself fails, requests still go through, because OpenRouter enforces the hard cap anyway.
- **`PromptService`** builds the prompts, rejects instructions that try to override the system prompt, extract it, or change the output format, and strips control characters and the prompt's own delimiter tags from document text. It also validates the model's output: next-word suggestions must be at most 4 words each, and a rewrite that's wildly longer than the selection is rejected.
- **Endpoints**: `POST /api/helper/suggestionautocomplete` uses GPT-4o mini, and `POST /api/helper/selectionautocomplete` uses GPT-4o. Both model IDs are configurable in `appsettings.json`.

**Two things I adjusted from your spec**

- **No `HelperController` class.** You asked for a Minimal API, and controllers are the other style, so mixing them would look inconsistent to a .NET reviewer. The endpoints live in `HelperEndpoints` under an `/api/helper` route group. If you'd rather have a real `[ApiController]`, it's a small change.
- **The selection endpoint accepts an optional `history`**, so the frontend's multi-turn refine ("shorter", then "more formal") keeps working.

**One thing to decide before wiring up the frontend:** `suggestionautocomplete` now returns next-word continuations, but the Co-author pane currently shows improvements to the paragraph as diffs. Connecting this endpoint means changing the pane to something like ghost-text suggestions you accept with Tab. Keep in mind the brief's warning against AI that completes the document; short continuations of 1–4 words should be fine, but it's worth mentioning in the README.
