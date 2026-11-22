# Tasks

Built on `add-text-option`, `add-option-conditions` and `add-picture-option` (archived). Merged before `add-protect-pdf`.

## 1. Registry entry

- [ ] 1.1 Add `NewPasswordOption` (`kind: 'new-password'`, `key`, `label`, `againLabel`, `hint`, `emptySentence`, `againSentence`, optional `refusedSentence` and `when`; no limit or rule) to `src/tools/registry.ts` and to `ToolOption`; in `src/widget/option-values.ts` add `PasswordCharacterRule` (`'printable-ascii'`), `PasswordRule`, `PasswordTable`, `optionPasswords` (empty of tools), `passwordCharacters` (U+0020 to U+007E), `passwordProblem` (empty, characters, edge-space, too-long, in that order; never trims, composes or cuts), `passwordRule`, `acceptedPassword` (own keys only; returns the same string) and `PasswordRefused` (its message holds nothing of the password); extend the registry test with the checks of the tool-registry delta (key a plain word, not `passwords`, not a preset, item or other option key; words plain, not empty, no exclamation mark; a line in `optionPasswords` with `maxLength` from 1 to 127 and a known rule, and the reverse; a hint's number of characters matching `maxLength`; the hint ending with `passwordAdvice[rule.characters]`), each with a failing case built from a test entry and table, and every existing entry still passing; verify with `npm test` and `npm run check`

## 2. Engine

- [ ] 2.1 No tool engine changes: no tool has a new password yet. `passwordRule` and `acceptedPassword` are unit tested in `tests/unit/options.test.ts` with a filled test table (a good password returned as the same string; not a string, `null`, empty, a space first or last, too long, a refused character, `__proto__`, `toString` refused), and `PasswordRefused`'s message holds no password; verify the tests pass

## 3. Engine unit tests

- [ ] 3.1 In `tests/unit/options.test.ts`: `passwordProblem` as the design's Tests list it, including every printable ASCII character taken with spaces inside, " a" and "a " refused, "café", "पासवर्ड", "مرور", "密码", "£", "€", an emoji, a tab, a newline, a no-break space, U+202E and a soft hyphen refused as characters, an "e" with a separate accent refused rather than composed, 127 taken and 128 too long under a 127 rule, and characters reported before length; verify the tests pass
- [ ] 3.2 Add `tests/unit/password-rule.test.ts`: with this repo's qpdf and PDF.js in Node, encrypt `tests/fixtures/text.pdf` with `--encrypt --user-password=P --owner-password=P --bits=256 --` for P made of all 95 printable ASCII characters (the space inside), P = `--help` and P = `@in.pdf`; each file passes `qpdf --check` with P, `--show-encryption` says R = 6 and AESv3, and it opens with P and not with P less its last character in qpdf and in PDF.js; verify the test passes

## 4. State, rules and worker wiring

- [ ] 4.1 `src/widget/options.ts`: `pairProblem`, `passwordSentence` (fixed words only; never a character, a length or the password), `passwordAdvice`, and `optionsHold`, `optionsToSend` and `jobOptions` given `newPasswords` as a new last parameter with an empty default (first-field problems first, then the pair; `empty`, `again-empty` and `again-partial` under the main button, the rest by their field; a hidden one never holds or is sent; one with no table line always holds; only the first field sent, as typed); `FailureKind` gains `password-refused`, mapped from `PasswordRefused` in `worker-core.ts`, accepted by `messages.ts`, with its sentence in `failures.ts` (the tool's `refusedSentence`, else "The password could not be used. Go back to your file and type it again."); no change to the reducer's state or actions; verify with new cases in `tests/unit/options.test.ts` (including the check that no sentence or status message holds a marked password, the marked string or a refused character), `tests/unit/failures.test.ts`, `tests/unit/worker-core.test.ts` and `tests/unit/messages.test.ts`, the existing cases passing unchanged
- [ ] 4.2 `src/hooks/useToolRun.ts`: hold `newPasswords` (`{ [key]: { first, again } }`) in a `useState` of its own with a ref kept in step by its setter, never in the reducer; expose it with `setNewPassword(key, field, value)`; pass it to `jobOptions` in `start`; forget it (`forgetNewPasswords`) when a job finishes with a file or with no new file, in `clear` (Start again and `pagehide`) and when the last file is removed, each in its handler and not in an effect; keep it through Cancel, a failure, "Go back to your file" and "Choose another file"; verify that a test entry's new password, passed through `jobOptions`, reaches the real `ToolClient`'s run message once, under its key, with a fake worker, and that `tests/unit/state.test.ts` passes unchanged

## 5. Page

- [ ] 5.1 Add `src/components/NewPasswordField/` with `NewPasswordField.module.css` (a top margin and the `.note` and `.error` rules copied from `TextField`, on purpose); two `type="password"` fields with `autocomplete="new-password"` and `enterKeyHint="go"`, no `name`, no form, no `maxlength`, each with its visible label and its sentence between the label and the field; the hint followed by "The password stays in your browser. It is not sent anywhere." under the first field, in its `aria-describedby`; `aria-invalid` and `aria-describedby` on each field for its own sentence; Enter through `pressesButton`; no hooks; in `ToolWorkspace`, draw it in registry order once the file has been read, while listing; tie the main button to the holding sentence (under it, or the field's error id); Enter does what the main button does and, while it waits, says why on every press; the status region says a field sentence once when its field and kind change; `optionRef` on the first field when it is the first option; verify with `NewPasswordField`'s markup and handler tests in `tests/unit/components.test.tsx` as the design lists, and every existing component test passing unchanged
- [ ] 5.2 No page text: no page shows a new password yet; verify the built pages are unchanged with `npm run build` and `npm run weigh`

## 6. End-to-end test

- [ ] 6.1 No end-to-end test in this change, as no published page has a new password; every existing end-to-end test must pass unchanged; verify with `npm run e2e -- --trace off`. Protect's end-to-end test is the first browser test of the fields

## 7. No-upload test

- [ ] 7.1 No request, storage or address is added, and the existing no-upload tests must pass unchanged; verify they do. The first tool with a new password (Protect) carries its password as a secret in its own no-upload test

## 8. Screenshots

- [ ] 8.1 No page changes how it looks, so no screenshots; the pull request says so, and Protect's pull request carries the fields at 360px and 1280px, light and dark, and at 200% text

## 9. Checks and review

- [ ] 9.1 Run the tool checks against every file in `tests/fixtures/`: not applicable, as no tool engine changes; record that in the pull request, with the fixtures README unchanged (`password-rule.test.ts` reads `text.pdf` only)
- [ ] 9.2 `LICENSES.md`: no change, as no dependency is added
- [ ] 9.3 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests and `npm run spec`; verify each passes
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names the agent's choices (a new password typed twice in two hidden fields, not a "Show password" button; printable ASCII with no space at either end, never changed; at most 127 characters and no shortest length; fixed sentences that never name a character, a length or the password; held in `useToolRun`, never in the reducer, kept through Cancel and a failure and forgotten when the job ends; `autocomplete="new-password"`; the `password-refused` failure; the new component folder), the four questions for the owner from the proposal, and that it is merged before `add-protect-pdf`

## Workflow follow-up

- After merge, archive the change with `/opsx:archive`; note it in "Where the project stands" in `CLAUDE.md`, and add the owner questions (characters in a password, shortest password, the browser's password manager, typed twice) under "Questions waiting for the owner"; then propose `add-protect-pdf` on top of it.
