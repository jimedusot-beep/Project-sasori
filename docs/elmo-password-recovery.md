# Elmo password setup and owner recovery

This procedure applies to the **Love2Learn Elmo B6572 protocol family**. It does not establish a universal password bypass for other toys or firmware. Sasori's browser setup implementation is software-tested; acceptance, password persistence and recovery on the owner's actual toy still need verification. The desktop client remains an existing-password client.

Open [Elmo Remote](https://jimedusot-beep.github.io/Project-sasori/elmo.html) in Bluefy on iPhone/iPad or a compatible Chrome installation. Keep the browser visible and the phone unlocked. See the [remote guide](elmo-remote.md) for Bluetooth permissions and normal controls.

## Keep an existing setup when possible

If the original Love2Learn app remains installed and accessible, Hasbro says its settings display the password under **Elmo Toy Connection**. Read it there, close the original app's connection, and enter it privately in Sasori. Leave **Set this password if Elmo reports none** unchecked.

The original app is no longer offered for new downloads, according to Hasbro. Sasori does not require that app to be installed for its own connection trial.

## Recover access when the password is forgotten

Hasbro documents a physical factory reset for the matching toy. **This erases the toy's stored personalization and settings.** It does not recover the old password. Only take this route if that loss is acceptable.

1. Disconnect Sasori and other apps from Elmo.
2. Leave Elmo's power switch **ON**.
3. Press the **factory-reset button next to the battery compartment**. Listen for the confirmation sound described by Hasbro. The source does not prescribe a hold duration; do not invent one.
4. In Sasori, enter a new password of 4–128 characters. Keep a private copy; Sasori does not save it.
5. Select **Set this password if Elmo reports none**, then choose **Connect Elmo** and select your toy.
6. Sasori waits for the exact no-password status before sending one password-setup frame. Existing-password rejection, unknown replies or an already authenticated session cannot trigger that write.
7. Wait for explicit reported acceptance. If successful, try **Play greeting**, listen to the toy, disconnect, and **Save connection result**.
8. Uncheck the setup option and reconnect with the chosen password. This fresh connection is the owner-run check that the toy retained it. Save that second result separately.

For a new toy that already has no password, start at step 4. Resetting is unnecessary for that case.

## Interpret failures and incomplete setup

- **Existing password rejected:** the setup checkbox cannot overwrite an existing password. Check the accessible original-app settings or use the documented physical-reset route.
- **No password is set:** select the setup option and enter the new password before a new attempt. It is disabled by default.
- **Setup not confirmed / connection interrupted:** the toy might have stored the new password before the link failed. Save the result and first try the chosen password with setup unchecked. A missing acknowledgment does not prove the write had no effect.
- **Repeated unset / malformed or unknown reply:** Sasori stops without repeating the setup write. Retain the result and exact message for review.
- **No confirmation sound or different hardware:** leave the result unverified and compare the exact model with Hasbro's instructions before proceeding.

The report includes `passwordSetupEnabled` and `passwordSetupOutcome` (`not-attempted`, `unset-reported`, `write-requested`, `not-confirmed`, `rejected`, or `toy-reported-acceptance`). It excludes passwords, digests and authentication packets. Reported acceptance is not independent physical verification. The remote neither presses the reset button remotely nor changes firmware.

## Evidence and implementation

| Source                                                                                                                                                                    | What it establishes                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [Hasbro: forgotten password](https://hasbro-new.custhelp.com/app/answers/detail/a_id/366/~/i-forgot-my-love2learn-elmo-app-password.-how-do-i-get-back-into-the-app%3F)   | Physical reset location, power ON, audible confirmation and erased settings; app download discontinuation                        |
| [Hasbro: Elmo settings](https://hasbro-new.custhelp.com/app/answers/detail/a_id/353/related/1)                                                                            | Password display in accessible original-app settings                                                                             |
| [Hasbro B6572 instructions listing](https://instructions.hasbro.com/en-us/instruction/playskool-friends-sesame-street-love2learn-elmo)                                    | Product/model identity                                                                                                           |
| [Recovered original-app method facts](../experiments/001-elmo-l2l/recovered-source.md)                                                                                    | `WritePasswordSet`, token `06000B7D`, RVA `3C900`: opcode 40 followed by the 16-byte password digest; password-status enum 0/1/2 |
| [Pinned community client](https://github.com/jesserockz/love2learn-elmo/blob/d397a7fb094079f6b1cac5605e95f74d1cb8d4b3/custom_components/love2learn_elmo/pyelmo/client.py) | A first-time enrollment implementation; Sasori uses an original, explicitly opted-in sender with stricter response handling      |

Reviewed October 23, 2026 (America/New_York). No original app code or credentials are redistributed. Synthetic tests establish byte construction, state handling, opt-in behavior, cancellation, deadlines, redaction and a modeled reconnect; they cannot establish that the physical toy accepted or retained a password.
