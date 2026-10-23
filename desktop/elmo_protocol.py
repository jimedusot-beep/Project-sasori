"""Original protocol-fact implementation; no radio, credentials or app code bundled.

Evidence and exact app method locations: experiments/001-elmo-l2l/recovered-source.md.
Only the known-password path is implemented; enrollment and arbitrary writes are absent.
"""
import hashlib
import struct

SERVICE = "dab91435-b5a1-e29c-b041-bcd562613bdf"
NOTIFY = "dab91382-b5a1-e29c-b041-bcd562613bdf"
WRITE = "dab91383-b5a1-e29c-b041-bcd562613bdf"
INPUT_NAMES = ("left_hand", "right_hand", "belly", "clap",
               "left_hand_belly", "right_hand_belly", "nose")
COMMANDS = {"inputs": b"\x20", "volume": b"\x22", "hello": b"\x10\x09\x00"}


def password_digest(password):
    """The app casts each UTF-16 code unit to its low byte, without normalization."""
    if not isinstance(password, str):
        raise ValueError("Enter the known toy password privately.")
    units = password.encode("utf-16-le", errors="surrogatepass")
    if not 4 <= len(units) // 2 <= 128:
        raise ValueError("This client accepts 4–128 UTF-16 units; it never guesses passwords.")
    return hashlib.md5(units[::2], usedforsecurity=False).digest()


def fletcher32(data):
    """App-compatible folding over even-length little-endian words, including negative zero.

    Odd input is rejected: the app reads pairs directly; zero padding is not established.
    The 1 KiB ceiling is this client's offline budget, not a toy specification.
    """
    if not isinstance(data, (bytes, bytearray)) or len(data) > 1024 or len(data) % 2:
        raise ValueError("Fletcher input must contain at most 1 KiB of complete 16-bit words.")
    first = second = 0xFFFF
    words = struct.unpack("<" + "H" * (len(data) // 2), data)
    for start in range(0, len(words), 359):
        for word in words[start:start + 359]:
            first += word
            second += first
        first = (first & 0xFFFF) + (first >> 16)
        second = (second & 0xFFFF) + (second >> 16)
    first = (first & 0xFFFF) + (first >> 16)
    second = (second & 0xFFFF) + (second >> 16)
    return ((second << 16) | first) & 0xFFFFFFFF


def response_frame(digest, challenge):
    if not isinstance(digest, (bytes, bytearray)) or len(digest) != 16:
        raise ValueError("A 16-byte password digest is required.")
    if (not isinstance(challenge, bytes) or not 2 <= len(challenge) <= 18
            or len(challenge) % 2):
        raise ValueError("Unsupported challenge length; no padding or reassembly is guessed.")
    return b"\x41" + struct.pack("<I", fletcher32(bytes(digest) + challenge))


def command_frame(intent):
    if intent not in COMMANDS:
        raise ValueError("Only input/volume queries and the single greeting are supported.")
    return COMMANDS[intent]


def parse_notification(packet):
    """Conservative complete-frame subset; never infer acceptance from empty/unknown status."""
    if not isinstance(packet, (bytes, bytearray)) or not 1 <= len(packet) <= 20:
        return None
    kind = packet[0]
    if kind == 0x41 and 3 <= len(packet) <= 19 and len(packet[1:]) % 2 == 0:
        return ("challenge", bytes(packet[1:]))
    if kind == 0x40 and len(packet) == 2 and packet[1] in (0, 1, 2):
        return ("password_status", packet[1])
    if kind == 0x20 and len(packet) == 2:
        return ("inputs", {name: bool(packet[1] & (1 << bit))
                           for bit, name in enumerate(INPUT_NAMES)})
    if kind == 0x22 and len(packet) == 2 and 1 <= packet[1] <= 15:
        return ("volume", packet[1])
    return None
