# Real iPhone + original Elmo: first owner acceptance

**Not tested on physical hardware yet.** This is a manual procedure, not a certification.
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

| Check | Actual result |
| --- | --- |
| Connect / permission | NOT TESTED |
| Existing-password acceptance | NOT TESTED |
| Status received | NOT TESTED |
| Greeting requested | NOT TESTED |
| Sound or motion independently observed | NOT TESTED |
| Disconnect and recovery | NOT TESTED |

**Pass:** authenticating, receiving status, requesting one greeting, independently
observing its effect and safely ending the trial. **Fail:** repeatable protocol failure or
no observed effect despite successful request. **Inconclusive:** permission, device access,
or observation failure. Record facts only; no synthetic or imported success.

Issues: [#4 real-Elmo inspection](https://github.com/jimedusot-beep/Project-sasori/issues/4)
and [#5 protocol verification](https://github.com/jimedusot-beep/Project-sasori/issues/5).
