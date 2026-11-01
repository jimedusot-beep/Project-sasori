# Real iPhone + original Elmo: later greeting trial

**Not tested on physical hardware yet.** This is a separate advanced experiment, not the initial inspection milestone or a certification.

**Prerequisites:** complete [issue #4's five inspection-only sessions](iphone-setup.md) on the actual owned Elmo, then establish an authorized, model-specific authentication specification under [issue #5](https://github.com/jimedusot-beep/Project-sasori/issues/5). An inspection subscription is not authentication. Do not start password or sound writes merely because the hosted page exposes controls.

Native Sasori does not implement Elmo authentication or sound writes. Open the
[hosted Elmo Remote](https://jimedusot-beep.github.io/Project-sasori/elmo.html)
inside Bluefy on your iPhone. Test only your own Love2Learn Elmo with an existing
legitimate password. Do not factory-reset or enroll a new password for this trial.

1. Record the date, exact toy model/revision, iPhone/iOS and Bluefy versions, and Sasori revision. Keep passwords, MAC addresses and raw authentication traffic private.
2. First run the **offline demo**. Confirm it is labeled simulation and does not connect.
3. With your toy powered on and its physical power switch accessible, tap Connect. Enter the existing password. Note exact acceptance/rejection/timeout. **Stop on failed authentication.**
4. Read device status; note returned volume/input values, or UNKNOWN if nothing replies.
5. Request **one** built-in greeting. Record separately whether the request was sent, whether a reply came, and whether you actually heard sound or saw mouth movement. A queued request alone is not success.
6. Stop/Disconnect. Observe whether sound/motion continues. Bluetooth disconnect **is not a guaranteed stop for the toy**; use its physical switch if required. Save the result and any errors.

| Check                                  | Actual result |
| -------------------------------------- | ------------- |
| Connect / permission                   | NOT TESTED    |
| Existing-password acceptance           | NOT TESTED    |
| Status received                        | NOT TESTED    |
| Greeting requested                     | NOT TESTED    |
| Sound or motion independently observed | NOT TESTED    |
| Disconnect and recovery                | NOT TESTED    |

**Pass:** authenticating, receiving status, requesting one greeting, independently
observing its effect and safely ending the trial. **Fail:** repeatable protocol failure or
no observed effect despite successful request. **Inconclusive:** permission, device access,
or observation failure. Record facts only; no synthetic or imported success.

Tracking: [#4 inspection-only acceptance](https://github.com/jimedusot-beep/Project-sasori/issues/4) must be completed first; [#5 authorized protocol verification](https://github.com/jimedusot-beep/Project-sasori/issues/5) is the prerequisite for an owner-authorized greeting trial. Neither issue is closed by a synthetic greeting or a command receipt.
