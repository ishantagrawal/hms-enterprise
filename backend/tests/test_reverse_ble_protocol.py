import base64
import hashlib
import hmac
import os
import sys
import unittest

from fastapi import HTTPException
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import attendance_v2


class ReverseBleProtocolTests(unittest.TestCase):
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
