# Elmo bench worksheet

Start with identification. The first pass requires no connection to a new supply or controller. Keep existing assemblies and connectors intact; the original BLE inspection can continue separately on the intact toy.

## Pass 1: power removed

1. Switch the toy off and remove its batteries. Disconnect any other power. Do not start this pass while a phone is connected and the toy is powered.
2. Record the model/revision marking, visible condition and inventory ID `ELM-001`. Use existing readable owner photos rather than taking duplicates. Redact unique identifiers before publishing.
3. Photograph the accessible board and connectors before unplugging anything. Include one overview and readable markings. If a connector cannot be reached without forcing a mechanism, leave it alone and record the gap.
4. Sketch connector orientation, key and numbered cavities. Assign local labels such as `J-A` and `J-B`; those labels are your drawing references, not manufacturer pin names. Do not cut wires or infer functions from their colors.
5. Identify the visible motor/speaker/switch markings, if accessible. Record `UNKNOWN` when markings are unreadable. Do not force the mouth or gearbox to discover travel.
6. Record the exact controller/driver boards and cables already available, if any. Photograph their model/revision labels. If none are available, leave selection pending rather than ordering from a generic parts list.

First-pass result: photographs or existing photo references plus the following short record. This is enough to choose the next investigation; it is not powered-test approval.

```text
Date/time and time zone:
Toy model/revision marking:
Power removed: yes / no (stop this pass if no)
Overview/marking photo references:
Board markings:
Accessible connector labels and orientation:
Motor marking: known value / UNKNOWN
Speaker marking: known value / UNKNOWN
Visible contacts or electrodes: description / UNKNOWN
Controller/driver boards actually available: exact models / UNKNOWN
Damage, binding or uncertainty:
Next single check:
```

## Pass 2: identified passive parts only

Proceed only when the specific part has been identified and electrically isolated. Check the meter and leads according to the instrument manual. Use an appropriate resistance/continuity setting with all power removed. Never use a resistance test on a powered circuit.

- An isolated, confirmed passive switch can be checked while pressed/released. Record both readings and which terminals were used. A touch electrode or an active sensor is not automatically suitable for this test.
- A separately disconnected, identified speaker may have its DC resistance recorded. Keep that observation separate from its nominal AC impedance and power rating; do not select an amplifier from the resistance alone.
- Continuity can help trace a documented harness while both ends are isolated. It does not establish the voltage or function of an unknown PCB pin.

Do not deliberately stall a motor, apply a loose battery to unknown wires, probe unknown live current, or power a detached board to identify it. An isolated motor resistance reading, if later appropriate, is not a voltage/current/duty approval.

```text
Test ID and inventory ID:
Part identity and isolation evidence:
Instrument/model, setting/range and lead check:
Terminals and conditions:
Observed reading(s), units and repeat count:
What this establishes:
What it does not establish:
Decision: UNKNOWN / CONDITIONAL / APPROVED for stated use / REJECTED
Next single check:
```

## Pass 3: design review before any powered retrofit

Required evidence: exact controller and driver, documented supply/logic levels, motor/audio requirements, polarity and connector map, original-controller isolation, USB/power backfeed assessment, mechanical clearance, stop behavior and an accessible physical disconnect. The relevant current limiting and acceptable duty/temperature criteria must be selected from actual evidence.

If any item is missing, keep the retrofit unpowered and continue software simulation or documentation. Once all are established, write a component-specific procedure: initialize with loads disabled, verify rails, check driver output with the load disconnected where the driver documentation permits, then perform the smallest justified load test under supervision. No generic pulse duration or supply voltage is approved here.

Stop and remove power for heating, odor, smoke, unexpected movement, binding, damaged insulation or an unexplained current/voltage result. Do not substitute a browser Stop button for the physical disconnect.

The [inventory](hardware-inventory.md#sources-and-limits) cites the source procedures. Keep actual measurement records and raw photos private when they contain identifiers; publish only reviewed summaries. All results are presently `NOT PERFORMED`.
