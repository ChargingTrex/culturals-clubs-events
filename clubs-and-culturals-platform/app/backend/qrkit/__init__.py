"""
Signed-token and QR rendering primitives, imported from qr-attendance-kit/core.

Kept as a plain library package rather than a Django app: it owns no models and
no migrations, and `certificates` will need the same token vocabulary that
`participation` uses. The provenance and licensing notes that travel with these
two files are in ../../qr-attendance-kit/docs/LICENSING.md and must stay with
them.
"""
