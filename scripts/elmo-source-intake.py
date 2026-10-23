"""Review a privately supplied original app without executing it or guessing authentication."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import sys
import zipfile

REPO = Path(__file__).resolve().parents[1]
MAX_APK = 100 * 1024 * 1024
MAX_ASSEMBLY = 32 * 1024 * 1024
MAX_MANIFEST = 2 * 1024 * 1024
ASSEMBLY = "assets/bin/Data/Managed/Assembly-CSharp.dll"
REPORTED_HASH = "5bf060fc681ece7746a9ced0b1ed6fc0ae9167c4c5c1b79bdb9eee1e05df4118"
MARKERS = ("password", "challenge", "Fletcher", "Bluetooth")


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def private_destination(value):
    path = Path(value).expanduser()
    if path.is_symlink():
        raise ValueError("Private output must not be a symlink.")
    path = path.resolve()
    if path.is_relative_to(REPO):
        raise ValueError("Keep private outputs outside the repository.")
    if path.exists():
        raise ValueError("Refusing to overwrite an existing private output.")
    if not path.parent.is_dir():
        raise ValueError("Create the private output directory first.")
    return path


def write_private(path, content):
    # Exclusive creation also prevents a symlink introduced after validation.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as output:
        output.write(content)


def bounded_member(archive, name, limit):
    matches = [info for info in archive.infolist() if info.filename == name]
    if len(matches) != 1:
        raise ValueError("Required member is missing or duplicated: " + name)
    info = matches[0]
    if info.flag_bits & 1 or info.file_size <= 0 or info.file_size > limit:
        raise ValueError("Encrypted, empty or oversized member: " + name)
    with archive.open(info) as member:
        content = member.read(limit + 1)
    if len(content) != info.file_size or len(content) > limit:
        raise ValueError("Invalid member size: " + name)
    return content


def inspect_source(apk_path):
    apk = Path(apk_path).expanduser()
    if not apk.is_file() or apk.stat().st_size > MAX_APK:
        raise ValueError("Supply an APK file of at most 100 MiB.")
    # One bounded read avoids unbounded allocation if an input grows during inspection.
    with apk.open("rb") as source:
        data = source.read(MAX_APK + 1)
    if len(data) > MAX_APK:
        raise ValueError("APK exceeds 100 MiB.")
    import io
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if len(archive.infolist()) > 20000:
            raise ValueError("APK member count exceeds 20,000.")
        for info in archive.infolist():
            name = info.filename
            if ("\\" in name or name.startswith("/") or
                    ".." in PurePosixPath(name).parts or "\x00" in name):
                raise ValueError("Unsafe archive member path.")
        assembly = bounded_member(archive, ASSEMBLY, MAX_ASSEMBLY)
        manifest = bounded_member(archive, "AndroidManifest.xml", MAX_MANIFEST)
    if not assembly.startswith(b"MZ"):
        raise ValueError("Managed assembly candidate lacks a PE signature.")
    digest = sha256(data)
    report = {
        "format": "sasori.elmo-source-review",
        "schemaVersion": 1,
        "apk": {"bytes": len(data), "sha256": digest},
        "reportedArtifact": {
            "package": "com.hasbro.ElmoLove2Learn",
            "version": "1.5.1 (39366)",
            "sha256": REPORTED_HASH,
            "hashMatchesPriorReport": digest == REPORTED_HASH,
            "publisherAuthenticityVerified": False,
            "packageAndVersionParsed": False,
        },
        "managedAssembly": {
            "member": ASSEMBLY, "bytes": len(assembly), "sha256": sha256(assembly),
            "pePrefixPresent": True,
            "managedMetadataVerified": False,
            "markerCounts": {
                marker: {"ascii": assembly.count(marker.encode("ascii")),
                         "utf16le": assembly.count(marker.encode("utf-16-le"))}
                for marker in MARKERS
            },
        },
        "manifest": {"bytes": len(manifest), "sha256": sha256(manifest), "parsed": False},
        "authenticationVerified": False,
        "credentialsExtracted": False,
        "artifactExecuted": False,
        "reviewRequired": [
            "Establish app package/version and publisher provenance independently.",
            "Review managed metadata and relevant methods in an offline decompiler.",
            "G2: method names/tokens/IL ranges for packet writers, transport and parsers.",
            "G3: password encoding, complete framing and source-derived synthetic vectors.",
            "G4: exact challenge construction, checksum variant and serialization vectors.",
            "G5: state ordering, correlated acceptance/rejection and freshness rules.",
            "G6: one complete status-query writer/parser and request/response vectors.",
            "G7: this unit's model/firmware, five baselines, cancellation and recovery evidence.",
            "G8: owner-held known password supplied privately only after implementation review.",
        ],
    }
    return report, assembly


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", help="Path to your legitimately obtained original APK")
    parser.add_argument("--output", required=True, help="New private JSON file outside this repository")
    parser.add_argument("--extract-managed", help="Optional new private DLL file outside this repository")
    args = parser.parse_args(argv)
    try:
        output = private_destination(args.output)
        extracted = private_destination(args.extract_managed) if args.extract_managed else None
        if extracted == output:
            raise ValueError("Use distinct receipt and assembly destinations.")
        report, assembly = inspect_source(args.apk)
        if extracted:
            write_private(extracted, assembly)
        write_private(output, (json.dumps(report, indent=2) + "\n").encode("utf-8"))
        print("Private source receipt saved. Authentication remains unverified; review the listed evidence gaps.")
        return 0
    except (ValueError, OSError, zipfile.BadZipFile, RuntimeError) as error:
        print("Source review failed: " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
