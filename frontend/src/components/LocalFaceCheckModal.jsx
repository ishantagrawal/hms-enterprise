import React, { useEffect, useRef, useState } from 'react';
import { verifyLocalBlinkGesture } from '../utils/faceBiometrics';
import { captureLivenessEmbedding, encodeAlignedFaceReference } from '../utils/faceEmbedding';
import './LocalFaceCheckModal.css';

export default function LocalFaceCheckModal({ onResult, purpose = 'attendance', challenge, offline = false, offlinePasskey = false }) {
  const videoRef = useRef(null);
  const onResultRef = useRef(onResult);
  const [status, setStatus] = useState('Requesting camera permission…');

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    const videoElement = videoRef.current;
    const controller = new AbortController();
    let stream;
    let active = true;

    const runCheck = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is not available in this browser.');
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });
        if (!active || !videoElement) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        videoElement.srcObject = stream;
        await videoElement.play();
        const liveness = purpose === 'attendance'
          ? await captureLivenessEmbedding(videoElement, setStatus, controller.signal, challenge)
          : await verifyLocalBlinkGesture(videoElement, setStatus, controller.signal);
        if (active) {
          if (!videoElement.videoWidth || !videoElement.videoHeight) {
            throw new Error('The camera did not provide a usable face frame. Try again.');
          }
          if (purpose === 'attendance') {
            stream.getTracks().forEach((track) => track.stop());
            videoElement.srcObject = null;
            onResultRef.current({ success: true, ...liveness });
            return;
          }
          const canvas = document.createElement('canvas');
          canvas.width = videoElement.videoWidth;
          canvas.height = videoElement.videoHeight;
          const context = canvas.getContext('2d', { alpha: false });
          if (!context) throw new Error('Could not prepare a secure face frame. Try again.');
          context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          const imageBase64 = canvas.toDataURL('image/jpeg', 0.78);
          canvas.width = 0;
          canvas.height = 0;
          const embeddingImageBase64 = purpose === 'enrollment'
            ? encodeAlignedFaceReference(videoElement, liveness)
            : undefined;
          stream.getTracks().forEach((track) => track.stop());
          videoElement.srcObject = null;
          onResultRef.current({ success: true, imageBase64, embeddingImageBase64 });
        }
      } catch (error) {
        if (active && error?.name !== 'AbortError') {
          onResultRef.current({ success: false, error: error?.message || 'Local face check failed.' });
        }
      }
    };

    runCheck();
    return () => {
      active = false;
      controller.abort();
      stream?.getTracks().forEach((track) => track.stop());
      if (videoElement) videoElement.srcObject = null;
    };
  }, [challenge, purpose]);

  return (
    <div className="ptm-face-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ptm-face-check-title">
      <section className="ptm-face-modal">
        <h2 id="ptm-face-check-title">
          {purpose === 'enrollment' ? 'Enroll face verification' : purpose === 'return' ? 'Confirm your return' : 'Verify your identity'}
        </h2>
        <p>
          Center your face and blink both eyes once. {purpose === 'attendance'
            ? offline
              ? offlinePasskey
                ? 'Face liveness and the 128D embedding are processed on this device. No image is sent; the session-bound passkey assertion can be queued offline, and the embedding is sent securely only after connectivity returns.'
                : 'Face liveness and the 128D embedding are processed on this device only. No image or embedding is sent; your enrolled device key creates the attendance proof.'
              : 'Live face frames stay on this device; a 128D embedding is sent securely for 1:1 verification.'
            : purpose === 'enrollment'
              ? 'One enrollment frame and its aligned crop are sent securely for'
              : 'A live face frame is sent over the secure connection for'}
          {offline && purpose === 'attendance'
            ? offlinePasskey
              ? ' The passkey assertion is bound to this session and can be synced after connectivity returns.'
              : ' The BLE proof will be uploaded only after the ESP32 batch is synced.'
            : purpose === 'enrollment'
            ? ' enrollment; the frame and derived 128D reference are stored encrypted.'
            : purpose === 'return'
              ? ' server-side verification against your encrypted enrollment reference; the live frame is not retained.'
              : ' a 1:1 check against your encrypted enrollment reference; the live frame is not retained.'}
        </p>
        <div className="ptm-face-camera-ring">
          <video ref={videoRef} autoPlay muted playsInline aria-label="Live camera preview for local face check" />
        </div>
        <div className="ptm-face-check-status" role="status">{status}</div>
        <button type="button" className="ptm-btn-secondary" onClick={() => onResultRef.current({ success: false, error: 'Face check cancelled.' })}>
          Cancel
        </button>
      </section>
    </div>
  );
}
