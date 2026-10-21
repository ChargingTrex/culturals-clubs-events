"""
Response shapes for the reporting routes.

The routes build plain dicts in reporting/services.py; these serializers are the
documented contract for the parts of them whose meaning is not obvious from the
key alone. They are read-only.
"""
from rest_framework import serializers


class CaptureMetricsSerializer(serializers.Serializer):
    """
    Door reliability for the semester, under two names (MASTER_SPEC §7.6).

    Two different questions were historically answered under one key:

    * `scan_success_rate` — accepted-or-spot scans / all scan attempts
      (`ScanRecord.result IN (accepted, spot_registered)` over every ScanRecord).
      "How many scan attempts succeeded at the door?" A station at 55% is
      rejecting half its queue. This is what the code computed before B-11.

    * `scan_capture_rate` — attended registrations with `source != manual` /
      attended registrations. "Are they scanning, or hand-entering?" A club with a
      persistently low ratio is marking attendance by hand (Database_And_Data_Flow
      §5.6). This is the documents' definition.

    `capture_rate` is kept as an ALIAS of `scan_capture_rate` — the documents'
    definition, not the old code's — so an existing reader of the overview keeps
    working and now gets the documented number. New readers should use the
    explicit names; the alias is scheduled for removal once the React frontend
    reads them.
    """

    scan_attempts = serializers.IntegerField(help_text="Every ScanRecord, failures included.")
    scans_accepted = serializers.IntegerField(help_text="ScanRecords with result accepted or spot_registered.")
    scan_success_rate = serializers.FloatField(
        allow_null=True, help_text="scans_accepted / scan_attempts; null when nothing was scanned.")
    attended = serializers.IntegerField(help_text="Attended, uncancelled registrations.")
    attended_by_scan = serializers.IntegerField(help_text="Of those, with source != manual.")
    scan_capture_rate = serializers.FloatField(
        allow_null=True, help_text="attended_by_scan / attended; null when nobody attended.")
    capture_rate = serializers.FloatField(
        allow_null=True, help_text="Alias of scan_capture_rate (the documents' definition).")
