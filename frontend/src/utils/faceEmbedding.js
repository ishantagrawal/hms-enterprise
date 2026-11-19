import * as ort from 'onnxruntime-web';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let sessionPromise;
let landmarkPromise;

async function getSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const modelUrl = import.meta.env.VITE_FACE_EMBEDDING_MODEL_URL || '/models/mobilefacenet.onnx';
      try {
        return await ort.InferenceSession.create(modelUrl, { executionProviders: ['webgl'] });
      } catch {
        return ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] });
      }
    })();
  }
  return sessionPromise;
}

async function getLandmarker() {
  if (!landmarkPromise) {
    const vision = await FilesetResolver.forVisionTasks('/models/wasm');
    landmarkPromise = FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1
    });
  }
  return landmarkPromise;
}

function alignedTensor(video, landmarks) {
  const left = landmarks[33];
  const right = landmarks[263];
  const eyeDistance = Math.hypot(right.x - left.x, right.y - left.y);
  if (!eyeDistance) throw new Error('The face landmarks are not stable enough.');
  const centerX = ((left.x + right.x) / 2) * video.videoWidth;
  const centerY = ((left.y + right.y) / 2) * video.videoHeight;
  const size = eyeDistance * video.videoWidth * 2.2;
  const canvas = new OffscreenCanvas(112, 112);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('The secure face tensor could not be created.');
  context.translate(56, 56);
  context.rotate(-Math.atan2(right.y - left.y, right.x - left.x));
  context.drawImage(video, centerX - size / 2, centerY - size * 0.62, size, size, -56, -56, 112, 112);
  const pixels = context.getImageData(0, 0, 112, 112).data;
  const tensor = new Float32Array(3 * 112 * 112);
  for (let index = 0; index < 112 * 112; index += 1) {
    tensor[index] = (pixels[index * 4] - 127.5) / 128;
    tensor[112 * 112 + index] = (pixels[index * 4 + 1] - 127.5) / 128;
    tensor[2 * 112 * 112 + index] = (pixels[index * 4 + 2] - 127.5) / 128;
  }
  return new ort.Tensor('float32', tensor, [1, 3, 112, 112]);
}

function cheekChrominance(video, landmarks) {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const points = [landmarks[50], landmarks[280], landmarks[205], landmarks[425]];
  const samples = points.map((point) => {
    const x = Math.max(0, Math.min(canvas.width - 1, Math.round(point.x * canvas.width)));
    const y = Math.max(0, Math.min(canvas.height - 1, Math.round(point.y * canvas.height)));
    const offset = (y * canvas.width + x) * 4;
    const sum = pixels[offset] + pixels[offset + 1] + pixels[offset + 2] || 1;
    return [pixels[offset] / sum, pixels[offset + 1] / sum, pixels[offset + 2] / sum];
  });
  canvas.width = 0;
  canvas.height = 0;
  return samples.reduce((total, sample) => total.map((value, index) => value + sample[index] / samples.length), [0, 0, 0]);
}

export async function extractFaceEmbedding(video, landmarks) {
  const session = await getSession();
  const input = alignedTensor(video, landmarks);
  const inputName = session.inputNames[0];
  const output = await session.run({ [inputName]: input });
  const values = Array.from(output[session.outputNames[0]].data, Number);
  if (values.length !== 128 || values.some((value) => !Number.isFinite(value))) {
    throw new Error('The face model did not return a valid 128D embedding.');
  }
  const norm = Math.hypot(...values);
  if (!(norm > 0)) throw new Error('The face model returned a zero-length embedding.');
  return values.map((value) => value / norm);
}

export async function captureLivenessEmbedding(video, onStatus, signal, challenge) {
  const landmarker = await getLandmarker();
  const startedAt = performance.now();
  let eyesOpen = false;
  let lastVideoTime = -1;
  const earCurve = [];
  let gestureComplete = false;
  let baselineYaw;
  let baselineNoseY;
  let firstReflection;
  let secondReflection;
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647', pointerEvents: 'none',
    border: '12px solid transparent', boxSizing: 'border-box'
  });
  document.body.appendChild(overlay);
  onStatus(`Complete the ${challenge.gesture.replace('_', ' ').toLowerCase()} and blink`);
  return new Promise((resolve, reject) => {
    let frameId;
    const cleanup = () => {
      if (frameId !== undefined) cancelAnimationFrame(frameId);
      overlay.remove();
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => { cleanup(); reject(new DOMException('Face check cancelled.', 'AbortError')); };
    const finish = (error, value) => {
      cleanup();
      if (error) reject(error);
      else resolve(value);
    };
    const detect = () => {
      if (signal?.aborted) return abort();
      if (performance.now() - startedAt > 30000) return finish(new Error('The liveness challenge expired. Try again.'));
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const result = landmarker.detectForVideo(video, performance.now());
        const landmarks = result.faceLandmarks?.[0];
        const categories = result.faceBlendshapes?.[0]?.categories || [];
        const leftBlink = categories.find((item) => item.categoryName === 'eyeBlinkLeft')?.score || 0;
        const rightBlink = categories.find((item) => item.categoryName === 'eyeBlinkRight')?.score || 0;
        const ear = (leftBlink + rightBlink) / 2;
        earCurve.push(ear);
        if (landmarks) {
          const nose = landmarks[1];
          const leftEar = landmarks[234];
          const rightEar = landmarks[454];
          const signedYaw = (nose.x - (leftEar.x + rightEar.x) / 2) / Math.max(rightEar.x - leftEar.x, 0.001);
          const yaw = Math.abs(signedYaw);
          baselineYaw ??= signedYaw;
          baselineNoseY ??= nose.y;
          const nodDelta = Math.abs(nose.y - baselineNoseY);
          gestureComplete = gestureComplete || (
            challenge.gesture === 'TILT_LEFT' ? signedYaw - baselineYaw < -0.08
              : challenge.gesture === 'TILT_RIGHT' ? signedYaw - baselineYaw > 0.08
                : nodDelta > 0.06
          );
          if (ear < 0.20) {
            overlay.style.borderColor = challenge.colors[0];
            firstReflection = cheekChrominance(video, landmarks);
            window.setTimeout(() => { overlay.style.borderColor = challenge.colors[1]; }, 200);
            window.setTimeout(() => {
              secondReflection = cheekChrominance(video, landmarks);
              overlay.style.borderColor = 'transparent';
            }, 400);
          }
          if (ear > 0.32) eyesOpen = true;
          if (eyesOpen && ear < 0.20 && gestureComplete) {
            const reflectionDelta = firstReflection && secondReflection
              ? Math.hypot(...firstReflection.map((value, index) => value - secondReflection[index]))
              : 0;
            extractFaceEmbedding(video, landmarks)
              .then((embedding) => finish(null, {
                embedding, blink_ear_curve: earCurve, yaw_delta: Math.max(yaw, nodDelta),
                head_gesture: challenge.gesture, rgb_reflection_delta: reflectionDelta,
                rgb_reflection_samples: [firstReflection || [0, 0, 0], secondReflection || [0, 0, 0]]
              }))
              .catch((error) => finish(error));
            return;
          }
        }
      }
      frameId = requestAnimationFrame(detect);
    };
    signal?.addEventListener('abort', abort, { once: true });
    frameId = requestAnimationFrame(detect);
  });
}
