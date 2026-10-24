// Selected CC0-1.0 data from Lucaslhm/Flipper-IRDB, not verified appliance support.
// Source pin, digest, license, and selected names: docs/flipper-ir-import.md.
export const IR_EXAMPLE_SOURCE =
  'https://github.com/Lucaslhm/Flipper-IRDB/blob/d126fb1b6f1e114c52b4a8c19839ea65e3a9c24d/TVs/Sony/Sony_Bravia.ir';
export const IR_EXAMPLE_NAME = 'Sony Bravia example';
export const IR_EXAMPLE_TEXT =
  'Filetype: IR signals file\nVersion: 1\n# CC0 community subset; physical compatibility unverified.\n# Source: Lucaslhm/Flipper-IRDB at d126fb1b6f1e114c52b4a8c19839ea65e3a9c24d\n#\nname: Power\ntype: parsed\nprotocol: SIRC\naddress: 01 00 00 00\ncommand: 15 00 00 00\n#\nname: Vol_up\ntype: parsed\nprotocol: SIRC\naddress: 01 00 00 00\ncommand: 12 00 00 00\n#\nname: Vol_dn\ntype: parsed\nprotocol: SIRC\naddress: 01 00 00 00\ncommand: 13 00 00 00\n#\nname: Input\ntype: parsed\nprotocol: SIRC\naddress: 01 00 00 00\ncommand: 25 00 00 00\n#\nname: Mute\ntype: parsed\nprotocol: SIRC\naddress: 01 00 00 00\ncommand: 14 00 00 00\nname: Ch_next\ntype: raw\nfrequency: 38000\nduty_cycle: 0.330000\ndata: 8958 4449 510 4475 515 4444 515 2213 508 4477 513 2215 516 2212 509 2219 512 2217 514 2214 517 2211 540 2214 517 2211 510 4449 510 2218 513 4472 507 2220 511 30572 8960 2218 513 87698 8966 2211 510 87701 8963 2214 568\n#\n';
