# Design

## Context

- The widget shows four kinds of option (`ToolOption` in `src/tools/registry.ts`): a choice, a text, a drawing and a picture. Choices, texts and drawings live in the reducer's `choices`; a picture's bytes are held in a ref in `useToolRun` beside the files, and the reducer holds only its name, size and status. Accepted values and limits are written once in `src/widget/option-values.ts` (`optionValues`, `optionTexts`, `optionDrawings`, `optionPictures`) and read by the widget, the registry test and the engine. `src/widget/options.ts` decides what is shown (`shownOptions`), what holds the main button (`optionsHold`) and what is sent (`optionsToSend`, `jobOptions`).
- `src/widget/state.ts` says at its top that the reducer "never holds a file's bytes or a password; those stay in memory inside useToolRun". Input passwords already live in `useToolRun`'s `passwords` ref and go to the worker beside the files, under the worker's own key `passwords`, which the registry test already refuses as an option key.
- `PasswordField` asks for an input file's password: one `type="password"` field with `autocomplete="off"`, no name, no form, a note "The password stays in your browser. It is not sent anywhere.", local `useState` for its value, and Enter through `pressesButton`.
- `TextField` is the model for a field that holds the main button: the sentence between the label and the field, the hint under it, `aria-invalid`, `aria-describedby`, the sentence said once by the status region when it appears or changes kind, and Enter while the button waits saying why on every press.
- Options are drawn only while listing. While working, done or failed, the working area shows other parts, so a field's own `useState` would be lost on Cancel or a failure.
- **Found by experiment** (Node, this repo's `@neslinesli93/qpdf-wasm` 0.3.1, which is qpdf 12.2.0, and `pdfjs-dist` 6.5.438):
  - `--encrypt --user-password=P --owner-password=P --bits=256 -- ` encrypts with R = 6 and AESv3; the file passes `qpdf --check` and opens with P, and only P, in qpdf and in PDF.js. P = `Open sesame -- @x "q" 1!` worked, so a password beginning with or holding `--`, `@` or quotes is safe in the named form. The positional form (`--encrypt user owner 256`) would read a password starting with `-` as an option, so it is not used.
  - A non-ASCII password (`pässwörd नमस्ते 🙂`) also round-trips in qpdf, which takes the argument's UTF-8 bytes as they are. Adobe applies SASLprep (NFKC and more) to a 256-bit password before hashing; PDF.js and qpdf do not. So outside ASCII the readers can disagree.
  - qpdf refuses an empty owner password with a 256-bit key unless `--allow-insecure` is given.
  - An input with its own password (`password.pdf`) written again with `--password=old … --encrypt …` opens with the new password and no longer with the old; a file with restrictions only (`restricted.pdf`) is written again without its owner password.

## Goals / Non-Goals

**Goals:**
- One way to declare, show, check, hold, send and forget a new password, built so `add-protect-pdf` uses it unchanged.
- The password never in the reducer, in a sentence, in storage, in the address or in the console; held no longer than the job needs.
- Keyboard, screen reader and phone use from the first version.

**Non-Goals:**
- Showing the password, a strength meter, a generated password, characters beyond printable ASCII, a shortest length, restrictions. Unlock PDF, and any change to `PasswordField`.

## Decisions

### 1. The registry type

```ts
/**
 * A password the visitor sets, typed twice in two hidden fields. It is the job's input: both start empty, and the
 * main button waits until both hold the same password its rule takes. Its most characters and character rule are
 * written once, in src/widget/option-values.ts (`optionPasswords`); the registry holds only its words. Its value is
 * never held in the widget's state.
 */
export type NewPasswordOption = {
  kind: 'new-password';
  /** The key the engine receives: `password`. Not `passwords`, which the worker sends. No page preset uses it. */
  key: string;
  /** The first field's label: "New password". */
  label: string;
  /** The second field's label: "Type the new password again". */
  againLabel: string;
  /** Under the first field, read with it, before the fixed note: what it takes. Ends with the rule's own words. */
  hint: string;
  /** Tied to the main button while the first field is empty: "Type a password first." */
  emptySentence: string;
  /** Tied to the main button while the second field is empty or part-typed: "Type the password again to check it." */
  againSentence: string;
  /** When the engine refuses the password. Left out: "The password could not be used. Go back to your file and type it again." */
  refusedSentence?: string;
  /** Shown only while the earlier choice `key` holds `value`. Left out, always shown. */
  when?: OptionCondition;
};

export type ToolOption = ChoiceOption | TextOption | DrawingOption | PictureOption | NewPasswordOption;
```

- **`kind: 'new-password'`, not `'password'`,** so it is never confused with the input file's password (`PasswordField`, `passwords`). The name follows the `autocomplete` token.
- The sentences for refused characters, a space at an end, a password too long and two passwords that differ are shared words in `options.ts`, not registry words: they say only what the rule says, and a tool has no reason to word them differently.
- A new password may be a tool's first option (Protect's is its only one), unlike a drawing.

### 2. Typed twice, both hidden

Considered:
- **One field with "Show password"** (GOV.UK's password input). GOV.UK advises it over a second field for account passwords, where a mistyped one is fixed by a reset. Here there is no reset: a mistyped password locks the visitor out of their own file for good. Showing turns the field into `type="text"`, where phone keyboards correct and capitalise words, browsers may keep the value in saved form state and session restore (Firefox writes it to disk), and anyone nearby or watching a shared screen reads it. It also needs a button whose state is announced.
- **One hidden field, no check.** Plainest, but a typo is unrecoverable.
- **Two hidden fields (chosen).** Plain markup, no extra control and nothing to announce. The fields stay `type="password"`, which browsers never keep in saved form state or session restore and keyboards never correct. Typing the same wrong layout twice would pass, which the ASCII rule catches for layouts of other scripts (decision 3).

The choice is the agent's, named in the proposal for the owner.

### 3. What a password takes, written once: `src/widget/option-values.ts`

```ts
/** The rules for which characters a new password takes. One for now. */
export type PasswordCharacterRule = 'printable-ascii';
export type PasswordRule = { maxLength: number; characters: PasswordCharacterRule };
export type PasswordTable = Readonly<Record<string, Readonly<Record<string, PasswordRule>>>>;

/** Each tool's new passwords, by tool id and key. Empty in this change; Protect adds `'protect-pdf': { password: { maxLength: 127, characters: 'printable-ascii' } }`. */
export const optionPasswords: PasswordTable = {};

/** The characters each rule takes, as code points: U+0020 to U+007E. */
export const passwordCharacters: Readonly<Record<PasswordCharacterRule, ReadonlySet<number>>>;

/** What is wrong with one password as typed, or null. Never changes it: no trimming, composing or cutting. */
export type PasswordProblem = { kind: 'empty' } | { kind: 'characters' } | { kind: 'edge-space' } | { kind: 'too-long' };
export function passwordProblem(password: string, rule: PasswordRule): PasswordProblem | null;

export function passwordRule(tool: string, key: string, table?: PasswordTable): PasswordRule | undefined;

/** For an engine: `value` itself when it is a string with no problem under the tool's own rule; else undefined. */
export function acceptedPassword(tool: string, key: string, value: unknown, table?: PasswordTable): string | undefined;

/** Thrown by an engine that refuses its password, before it reads the file. Known to the worker by its name. Its message never holds the password. */
export class PasswordRefused extends Error { override name = 'PasswordRefused'; }
```

- **Printable ASCII.** With a 256-bit key the PDF format hashes the password's UTF-8 bytes, cut to 127. Adobe first applies SASLprep, which normalises with NFKC, maps some characters to nothing and refuses others (and mixed right-to-left and left-to-right text); PDF.js and qpdf use the bytes as typed. Inside printable ASCII these steps change nothing, so every reader agrees. Outside it, a password could open the file in Firefox and not in Acrobat, which the visitor would find out only later. The rule also refuses a keyboard left on Devanagari, Arabic or another layout, which typing twice would not catch. Whether to allow other scripts is the owner's question.
- **No space first or last.** A space at an end is invisible in a hidden field and easy to add by accident; spaces inside are kept.
- **Order of problems:** empty, characters, edge-space, too-long, so a visitor who pasted a long line in another script first learns its characters cannot be used.
- **Counting** is by UTF-16 length, which equals bytes for the characters the rule takes; length is checked only after the characters pass.
- **Most characters** from 1 to 127 (the registry test): every reader cuts a longer password to 127 bytes, so a longer limit would let two different passwords open the same file.
- **No shortest length.** `SPEC.md` names none; the plainer option is none, and the owner is asked.
- `passwordRule` and `acceptedPassword` read only own keys with `Object.hasOwn`, as `acceptedValue` does. `acceptedPassword` returns the very string it was given, never a cleaned copy.

### 4. Where the password lives: `useToolRun`, not the reducer

- `useToolRun` holds the new passwords as `{ [key]: { first: string; again: string } }` in a `useState` of its own, outside the reducer, with a ref kept in step by the same setter so `start` reads the current value. It hands `newPasswords` and `setNewPassword(key, field, value)` to `ToolWorkspace`. The reducer, its actions and its tests never see a password; the comment at the top of `state.ts` stays true.
- **Kept** through Cancel, a failure and "Go back to your file", and "Choose another file" while listing (the new file is added before the old one goes), as other options are, so the visitor does not type it twice more. A hidden option's password is kept in memory, as other hidden options are, and not sent.
- **Forgotten** when a job finishes (a file, or no new file), by "Start again" (`reset`), when the last file is removed, and on `pagehide` (`clear`). Each is done in the handler that causes it, not in an effect, since the repo's lint forbids setting state in an effect body. The worker is ended after every job, as now, so the worker holds nothing afterwards either.
- No cap on what is held: a pasted megabyte is held, refused as too long and never sent.

### 5. The rules: `src/widget/options.ts`

Given `newPasswords` beside `choices`, as new last parameters with an empty default, so existing callers are unchanged:
- `pairProblem(first, again)`: `null` when equal; `'again-empty'` when the second is empty; `'again-partial'` when the second is shorter and the first starts with it; else `'mismatch'`. Checked only once the first has no problem.
- `optionsHold`: for a shown new password, the first field's problem, then the pair's, as an `OptionHold` with the field it belongs to (`first` or `again`). `empty`, `again-empty` and `again-partial` are said under the main button (`emptySentence`, `againSentence`); `characters`, `edge-space` and `too-long` by the first field; `mismatch` by the second. A new password with no line in `optionPasswords` always holds, with its empty sentence, so none is sent unchecked.
- `passwordSentence(option, rule, problem)`: fixed words only. "Some characters cannot be used." (the hint states the rule); "A password cannot start or end with a space."; "This password is too long. Use 127 characters or fewer." (the tool's limit, written with `number`); "The two passwords are not the same.". No refused character is ever named and no length is said: the status region reads these aloud, and on a shared screen or with a screen reader in a room a refused character or a length is part of the secret.
- `passwordAdvice['printable-ascii']`: "Use letters A to Z without accents, numbers, spaces and the marks on a US keyboard, such as @, # and -." No exclamation mark is given as an example, since the site's words use none. The registry test checks each hint ends with it, as hints end with `ruleAdvice`. The wording is a draft for the owner's review with Protect's page text.
- `optionsToSend`: a shown new password sends its first field's value as typed under its key. The second field is never sent.

### 6. The component and `ToolWorkspace`

`src/components/NewPasswordField/NewPasswordField.tsx`, with `NewPasswordField.module.css`. No hooks; `ToolWorkspace` gives it ids from `useId`.

```tsx
<div className={styles.group}>
  <div className="field field-short">
    <label htmlFor={id}>{option.label}</label>
    {firstError ? <p id={`${id}-error`} className={styles.error}>{firstError}</p> : null}
    <input ref={focusRef} id={id} type="password" autoComplete="new-password" enterKeyHint="go" value={first}
           aria-invalid={firstError ? true : undefined}
           aria-describedby={firstError ? `${id}-error ${id}-hint` : `${id}-hint`} … />
    <p id={`${id}-hint`} className={styles.note}>{option.hint} The password stays in your browser. It is not sent anywhere.</p>
  </div>
  <div className="field field-short">
    <label htmlFor={`${id}-again`}>{option.againLabel}</label>
    {againError ? <p id={`${id}-again-error`} className={styles.error}>{againError}</p> : null}
    <input id={`${id}-again`} type="password" autoComplete="new-password" enterKeyHint="go" value={again}
           aria-invalid={againError ? true : undefined}
           aria-describedby={againError ? `${id}-again-error` : undefined} … />
  </div>
</div>
```

- **Two labelled fields, no fieldset.** A legend would add a third name read before each label, for no gain.
- **`autocomplete="new-password"`** on both. It is the token for a password being set: password managers do not fill in a saved password, and may offer to suggest a strong one (filling both fields) or to save the one typed. `autocomplete="off"` was considered: Chrome and Firefox ignore it on password fields for saving, so it would not stop the offer, and it says less. The offer is the browser's own, which the visitor accepts or not; the page sends nothing. Protect's page text says the browser may offer to save it. The owner is asked.
- **The fixed note** is the sentence `PasswordField` already uses, which `SPEC.md` asks of a password field. It is part of the component, not registry words, so no tool can leave it out.
- No `name`, no form, no `maxlength`. `spellcheck` and `autocapitalize` are not needed on `type="password"`, which is never checked or capitalised.
- **The sentence between the label and the field** for both, where a phone keyboard does not hide it, as `TextField` does; bold in the text colour, as a wrong password's is. The CSS Module copies `TextField`'s `.note` and `.error` and adds the top margin, on purpose: each component owns its styles.
- **In `ToolWorkspace`:** drawn in registry order with the other options, once the file has been read, while listing. The main button is `aria-disabled` while `optionsHold` gives a hold; an under-button hold shows its sentence in the existing tied paragraph; a field hold ties the button's `aria-describedby` to that field's error id, so the sentence is on screen once. Enter in either field calls the main button's handler (`pressesButton`). The status region says a field sentence once when its field and kind change, and, on Enter while the button waits, the holding sentence on every press, as for a text. `optionRef` goes on the first field when the new password is the first option, so `focusMovesToOptions` moves focus there once the file is read, unchanged.

### 7. Sending and the failure

- `jobOptions(preset, itemOption, options, choices, newPasswords)` sends `{ ...preset, ...itemOption, ...optionsToSend(...) }`, the new password among them under its key. The worker merges `passwords` (input passwords) last, as now, so no key is replaced.
- `FailureKind` gains `password-refused`. `worker-core` maps an error named `PasswordRefused` to it, as it maps `TextRefused`; `messages.ts` accepts the kind. `failureSentence` gives the first shown new password's `refusedSentence`, else "The password could not be used. Go back to your file and type it again." The page should never send a password the engine refuses; this is reached only if the widget and the engine disagree.

## Page weight and late loading

The script before a pick is unchanged: no published tool has a new password, and the component and rules go in the workspace chunk, fetched after a pick. The character set is a range, not a list. The CSS Module adds a few lines to the stylesheets, well under 0.1 KB by gzip. `npm run weigh` must pass. No WebAssembly is fetched sooner; this change adds no engine.

## Threats

- **The password leaking from the page.**
  - Not in the reducer, so not in anything that reads the state. Held in `useToolRun` only, forgotten at the end of the job, on "Start again", when the last file is removed and on `pagehide`.
  - No name and no form, so it is never submitted to an address; never in storage, the address, the title or the console.
  - No sentence, status message or error holds it, a refused character or its length; a unit test checks every sentence against marked passwords. `PasswordRefused`'s message holds nothing of it.
  - `type="password"` throughout, so it is never kept in saved form state or session restore, and never corrected or suggested by a keyboard.
  - Password managers and keyboard apps are the browser's and the phone's; the page claims nothing about them beyond saying the browser may offer to save it.
- **The password leaking from the worker** (for `add-protect-pdf`, written here so the shape fits): the engine passes it only inside `--user-password=` and `--owner-password=`, never in the positional form and never as a whole argument, so qpdf cannot read it as an option or as `@file`; an engine error never carries qpdf's printed text; the worker is ended after the job.
- **A password readers disagree on.** Refused by the ASCII rule, with a sentence, before any job.
- **A huge paste.** Checked in milliseconds, shown as too long, never sent.
- **No file parsing** is added. Malicious PDFs, oversized files and hostile file names are untouched by this change.

## Tests

- **Unit, `tests/unit/options.test.ts`:**
  - `passwordProblem`: empty; "a"; 127 characters taken and 128 too long under a 127 rule; every printable ASCII character taken with spaces inside; " a" and "a " edge-space; "café", "पासवर्ड", "مرور", "密码", "£", "€", an emoji, a tab, a newline, a no-break space, U+202E and a soft hyphen refused as characters; characters before length; nothing is trimmed or composed (an "e" plus a separate accent is refused, not composed);
  - `passwordRule` and `acceptedPassword` with a filled test table: a good password returned as the same string; not a string, `null`, empty, edge-space, too long, a refused character, `__proto__` and `toString` refused;
  - `pairProblem`: equal, second empty, second a shorter start of the first, second different, second longer;
  - `optionsHold` with a test entry: empty, then first typed, then part-typed, then different, then equal and none; a first-field problem before any pair problem; a hidden new password never holds; one with no table line always holds;
  - `optionsToSend` and `jobOptions`: the first field's value sent as typed, the second never, a hidden one not at all, choices and texts as before;
  - every sentence and status message, for passwords built around a marked string in each case the rules know, holds neither the password, the marked string nor a refused character.
- **The rule against the readers** (`tests/unit/password-rule.test.ts`): with this repo's qpdf and PDF.js in Node, a small fixture encrypted with `--encrypt --user-password=P --owner-password=P --bits=256 --` for P made of all 95 printable characters with the space inside, P = `--help`, and P = `@in.pdf`; each opens with P and not with P less its last character in both qpdf (`--check` passes, `--show-encryption` says R = 6 and AESv3) and PDF.js.
- **Failure:** `worker-core` maps `PasswordRefused` to `password-refused`; `failureSentence` gives the generic sentence and a test entry's own; `messages.ts` accepts the kind.
- **Worker message:** a test entry's new password, passed through `jobOptions`, reaches the real `ToolClient`'s run message, with a fake worker, under its key and once.
- **Registry:** the checks in the tool-registry delta, run on every entry, each with a failing case built from a test entry and table, since `optionPasswords` is empty in this change.
- **Component,** `tests/unit/components.test.tsx`: `NewPasswordField` by its markup (two `type="password"` fields with `autocomplete="new-password"` and `enterkeyhint="go"`, labels tied by `for`, no `name`, no `maxlength`, no form; the hint and fixed note under the first field and in its `aria-describedby`; without errors no `aria-invalid`; with a first-field error, its sentence between the label and the field, `aria-invalid` and `aria-describedby` naming the sentence then the hint; with a mismatch, the same on the second field) and by its handlers (each field's typing reaches `onType` with its field; Enter calls `onEnter` and prevents the default, a composing Enter does not; the focus ref is on the first field). As before, `ToolWorkspace` is not rendered in a test: there is no render harness, and adding one is a dependency this change does not add.
- **`useToolRun`:** no test runs the hook itself, as before; the forgetting rules are written so each handler calls one plain function (`forgetNewPasswords`), and Protect's end-to-end test checks them in a browser.
- **End-to-end:** none in this change, as no published page has a new password. Protect's end-to-end test is the first browser test: focus on the first field after reading and after an input password, both sentences under the main button, part-typed and different, refused characters, a space at an end, a long paste, Enter, Tab order, the status message once, Cancel, a failure and "Start again", and phone width; its screenshots show the fields at 360px and 1280px, light and dark, and at 200% text.
- **Other tools:** every existing unit and end-to-end test passes unchanged.

## Risks / Trade-offs

- **[Built before its first user]** The shape could miss what Protect needs. → `add-protect-pdf` is sketched in the proposal and uses exactly these words; anything more comes in its own change.
- **[Only printable ASCII]** A visitor who wants a password in Hindi or with accents cannot have one. → Refused with a sentence and stated in the hint; the owner is asked.
- **[Typing twice is slower on a phone]** → One extra field for a password that cannot be recovered; the owner may prefer a "Show password" button.
- **[The browser offers to save the password]** A saved password may sync with the visitor's browser account. → It is the browser's offer, which the visitor accepts or declines; Protect's page says so; the owner is asked.
- **[Forgotten after the job]** A visitor who wants a second protected copy types the password again. → The shortest time held; "Start again" clears it anyway.
- **[Same wrong layout twice]** Typing twice on a keyboard set to another Latin layout (such as French AZERTY, with "a" and "q" swapped) passes the check. → The password is what was typed; the visitor types it the same way to open the file. Nothing more the page can tell.

## Migration Plan

None. No tool uses a new password until Protect.
