"""Synthetic archive tests; no original app or real credentials are included."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
import warnings
import zipfile

SPEC = importlib.util.spec_from_file_location(
    "source_intake", Path(__file__).resolve().parents[1] / "scripts/elmo-source-intake.py")
intake = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(intake)


class SourceIntakeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.apk = self.root / "fixture.apk"

    def archive(self, assembly=b"MZsynthetic password challenge", extra=None):
        with zipfile.ZipFile(self.apk, "w") as archive:
            archive.writestr(intake.ASSEMBLY, assembly)
            archive.writestr("AndroidManifest.xml", b"synthetic manifest")
            if extra:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", UserWarning)
                    archive.writestr(*extra)

    def test_receipt_is_bounded_private_and_never_promotes_authentication(self):
        self.archive()
        output, dll = self.root / "receipt.json", self.root / "private.dll"
        self.assertEqual(intake.main([str(self.apk), "--output", str(output),
                                      "--extract-managed", str(dll)]), 0)
        report = json.loads(output.read_text())
        self.assertFalse(report["authenticationVerified"])
        self.assertFalse(report["reportedArtifact"]["hashMatchesPriorReport"])
        self.assertFalse(report["reportedArtifact"]["packageAndVersionParsed"])
        self.assertFalse(report["managedAssembly"]["managedMetadataVerified"])
        self.assertEqual(report["managedAssembly"]["markerCounts"]["password"]["ascii"], 1)
        self.assertNotIn("MZsynthetic", output.read_text())
        self.assertEqual(dll.read_bytes(), b"MZsynthetic password challenge")
        if os.name == "posix":
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)
            self.assertEqual(dll.stat().st_mode & 0o777, 0o600)
        self.assertEqual(intake.main([str(self.apk), "--output", str(output)]), 1)

    def test_missing_duplicate_invalid_and_unsafe_members_are_refused(self):
        for extra in [(intake.ASSEMBLY, b"MZduplicate"), ("../escape", b"unsafe")]:
            self.archive(extra=extra)
            with self.assertRaises(ValueError):
                intake.inspect_source(self.apk)
        self.archive(assembly=b"not a PE file")
        with self.assertRaisesRegex(ValueError, "PE signature"):
            intake.inspect_source(self.apk)
        with zipfile.ZipFile(self.apk, "w") as archive:
            archive.writestr("AndroidManifest.xml", b"fixture")
        with self.assertRaisesRegex(ValueError, "missing or duplicated"):
            intake.inspect_source(self.apk)

    def test_outputs_cannot_enter_repo_or_replace_symlinks(self):
        with self.assertRaisesRegex(ValueError, "outside"):
            intake.private_destination(intake.REPO / "private-app.json")
        victim = self.root / "victim"
        victim.write_text("keep")
        link = self.root / "link"
        link.symlink_to(victim)
        with self.assertRaisesRegex(ValueError, "symlink"):
            intake.private_destination(link)
        with self.assertRaises(FileExistsError):
            intake.write_private(link, b"replace")
        self.assertEqual(victim.read_text(), "keep")

    def test_size_limits_and_hashes_use_the_actual_input(self):
        self.archive()
        report, assembly = intake.inspect_source(self.apk)
        self.assertEqual(report["apk"]["sha256"], intake.sha256(self.apk.read_bytes()))
        self.assertEqual(report["managedAssembly"]["sha256"], intake.sha256(assembly))
        original = intake.MAX_ASSEMBLY
        try:
            intake.MAX_ASSEMBLY = 4
            with self.assertRaisesRegex(ValueError, "oversized"):
                intake.inspect_source(self.apk)
        finally:
            intake.MAX_ASSEMBLY = original


if __name__ == "__main__":
    unittest.main()
