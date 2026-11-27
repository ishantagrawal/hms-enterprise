import base64
import hashlib
import hmac
import os
import sys
import unittest
from types import SimpleNamespace

from fastapi import HTTPException
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from starlette.requests import Request

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import attendance_v2


class ReverseBleProtocolTests(unittest.TestCase):
    def test_esp32_poll_signature_binds_beacon_id_and_timestamp(self):
        secret = bytes(range(32))
        beacon_id = "BEA-1a2b3c"
        timestamp = "1893456000"
        expected = hmac.new(
            secret,
            f"{beacon_id}|{timestamp}".encode("ascii"),
            hashlib.sha256,
        ).hexdigest()

        signature = attendance_v2._esp32_session_poll_signature(
            secret, beacon_id, timestamp
        )

        self.assertEqual(signature, expected)
        self.assertNotEqual(
            signature,
            attendance_v2._esp32_session_poll_signature(
                secret, beacon_id, str(int(timestamp) + 1)
            ),
        )

    def test_active_session_poll_requires_signed_recent_request(self):
        secret = b"S" * 32

        class FakeCursor:
            def __init__(self, row=None, rows=None):
                self.row = row
                self.rows = rows or []

            def fetchone(self):
                return self.row

            def fetchall(self):
                return self.rows

        class FakeConnection:
            def rollback(self):
                pass

            def close(self):
                pass

        beacon = {
            "id": "BEA-1a2b3c",
            "scope": "CLASS",
            "is_active": 1,
            "signing_secret_enc": "encrypted",
        }

        def db_exec(_conn, query, _params=()):
            if "FROM attendance_v2_beacons" in query:
                return FakeCursor(row=beacon)
            if "FROM attendance_v2_sessions" in query:
                return FakeCursor(rows=[])
            raise AssertionError(f"Unexpected query: {query}")

        backend = {
            "ACTIVE_COLLEGE_ID": SimpleNamespace(get=lambda: "college"),
            "get_conn": FakeConnection,
            "db_exec": db_exec,
            "_beacon_signing_cipher": lambda: SimpleNamespace(
                decrypt=lambda _value: secret.hex().encode("ascii")
            ),
        }
        app = SimpleNamespace(state=SimpleNamespace(attendance_v2_backend=backend))
        beacon_id = beacon["id"]
        timestamp = str(int(attendance_v2._now().timestamp()))
        signature = attendance_v2._esp32_session_poll_signature(secret, beacon_id, timestamp)

        def make_request(request_signature):
            headers = [
                (b"x-vidyut-timestamp", timestamp.encode("ascii")),
                (b"x-vidyut-signature", request_signature.encode("ascii")),
            ]
            return Request({
                "type": "http",
                "method": "GET",
                "path": "/api/attendance/esp32-active-session",
                "headers": headers,
                "query_string": b"",
                "app": app,
            })

        self.assertEqual(
            attendance_v2.get_esp32_active_session(make_request(signature), beacon_id),
            {"active": False},
        )
        with self.assertRaises(HTTPException) as error:
            attendance_v2.get_esp32_active_session(make_request("0" * 64), beacon_id)
        self.assertEqual(error.exception.status_code, 401)

    def test_student_proof_covers_full_nonce_and_big_endian_roll_id(self):
        key = b"K" * 32
        nonce = bytes.fromhex("01020304")
        roll_id = 0x01020304
        message = nonce + roll_id.to_bytes(4, "big")
        proof = hmac.new(key, message, hashlib.sha256).digest()[:8]

        self.assertEqual(len(proof), 8)
        self.assertEqual(message, bytes.fromhex("0102030401020304"))
        self.assertTrue(hmac.compare_digest(
            proof,
            hmac.new(key, bytes.fromhex("0102030401020304"), hashlib.sha256).digest()[:8],
        ))

    def test_wrapped_ble_key_can_only_be_recovered_with_client_private_key(self):
        client_key = ec.generate_private_key(ec.SECP256R1())
        public_der = client_key.public_key().public_bytes(
            serialization.Encoding.DER,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        secret = b"S" * 32
        wrapped = attendance_v2._wrap_ble_secret(base64.b64encode(public_der).decode("ascii"), secret)

        ephemeral = serialization.load_der_public_key(
            base64.b64decode(wrapped["ble_key_ephemeral_public_key"])
        )
        shared = client_key.exchange(ec.ECDH(), ephemeral)
        salt = base64.b64decode(wrapped["ble_key_salt"])
        key = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            info=b"vidyut-attendance-ble-key-v1",
        ).derive(shared)
        recovered = AESGCM(key).decrypt(
            base64.b64decode(wrapped["ble_key_nonce"]),
            base64.b64decode(wrapped["ble_key_ciphertext"]),
            b"vidyut-attendance-ble-key-v1",
        )

        self.assertEqual(recovered, secret)

    def test_wrapping_rejects_non_p256_public_keys(self):
        other_key = ec.generate_private_key(ec.SECP384R1())
        public_der = other_key.public_key().public_bytes(
            serialization.Encoding.DER,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )

        with self.assertRaises(HTTPException):
            attendance_v2._wrap_ble_secret(base64.b64encode(public_der).decode("ascii"), b"S" * 32)


if __name__ == "__main__":
    unittest.main()
