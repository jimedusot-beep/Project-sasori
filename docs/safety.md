# Safety and privacy boundaries

1. Test only equipment you own or have permission to research.
2. Keep hands, loose parts, and cables clear of powered gears. Switch off power before rearranging exposed wires.
3. Abort testing if any part becomes hot, emits smoke, sparks, binds, or moves unexpectedly.
4. Do not publish passwords, personal device identifiers, private authentication challenge/response records, or identifiable information in issues or exported reports.
5. Use verified device documentation and captured observations; never guess a power pinout, command byte, key, or physical rating.
6. This starter sends no application-level write commands. Enabling notifications can change the GATT CCCD subscription descriptor.
7. Do not attempt firmware flashing, motor actuation, or security bypass with this inspection-only site.
8. A successful Bluetooth connection does not establish an authenticated command channel. Passing static tests does not establish hardware success.

See the repository README and Experiment 001 notes for verification gaps.

## v0.2 safeguards

The live transport has no application characteristic-write method. The user must explicitly select a device after reviewing the profile and authorization checkbox. Discovery/connection operations are time-bounded, inspection disconnects after 15 seconds from GATT connection, and a 500-notification budget terminates noisy captures. There are no automatic reconnects or authentication retries.

Changing a page or stopping a simulation is not a physical emergency stop. A browser disconnect cannot guarantee a motor has stopped. Keep an accessible physical power switch; stop and remove power according to intended toy operation if movement, heat, binding, or damaged wiring is observed. Do not perform teardown or power detached boards as part of the BLE inspection milestone.

Simulated actuator positions are normalized visual values, not electrical or mechanical limits. Synthetic authentication success has no implication for Elmo. Phone-local audio preview is not toy playback.

Raw payload persistence/export is explicitly opt-in for each session and may contain unknown binary secrets. Default metadata backups omit those bytes. Never replay an imported capture or publish private authentication material.
