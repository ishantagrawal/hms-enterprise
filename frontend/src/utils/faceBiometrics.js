import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let landmarkerPromise;

async function loadCachedModel() {
  const modelUrl = new URL('/models/face_landmarker.task', window.location.origin).toString();
  if (!('caches' in globalThis)) {
    const response = await fetch(modelUrl);
    if (!response.ok) throw new Error('The on-device face model could not be loaded.');
    return new Uint8Array(await response.arrayBuffer());
  }

  const cache = await caches.open('hms-face-model-v1');
  let response = await cache.match(modelUrl);
  if (!response) {
    response = await fetch(modelUrl);
    if (!response.ok) throw new Error('The on-device face model could not be loaded.');
    try {
      await cache.put(modelUrl, response.clone());
    } catch (cacheError) {
      console.warn('The face model loaded, but could not be retained in Cache Storage:', cacheError);
    }
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function getFaceLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks('/models/wasm');
      const modelAssetBuffer = await loadCachedModel();
      try {
        return await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetBuffer: modelAssetBuffer.slice(),
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true
        });
      } catch (gpuError) {
        console.warn('GPU face processing is unavailable; using CPU:', gpuError);
        return FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetBuffer: modelAssetBuffer.slice(),
            delegate: 'CPU'
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true
        });
      }
    })();
  }
  return landmarkerPromise;
}

export async function verifyLocalBlinkGesture(video, onStatus, signal) {
  const landmarker = await getFaceLandmarker();
  const startedAt = performance.now();
  let eyesWereOpen = false;
  let lastVideoTime = -1;

  onStatus('Center your face and blink both eyes once');

  return new Promise((resolve, reject) => {
    let frameId;
    const cleanup = () => {
      if (frameId !== undefined) cancelAnimationFrame(frameId);
      signal?.removeEventListener('abort', handleAbort);
    };
    const handleAbort = () => {
      cleanup();
      reject(new DOMException('Face check cancelled.', 'AbortError'));
    };
    const finish = (error, result) => {
      cleanup();
      if (error) reject(error);
      else resolve(result);
    };
    const detect = () => {
      if (signal?.aborted) {
        handleAbort();
        return;
      }
      if (performance.now() - startedAt > 12000) {
        finish(new Error('Face check timed out. Keep your face in view and blink once.'));
        return;
      }
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const result = landmarker.detectForVideo(video, performance.now());
        const categories = result.faceBlendshapes?.[0]?.categories || [];
        const leftBlink = categories.find((category) => category.categoryName === 'eyeBlinkLeft')?.score || 0;
        const rightBlink = categories.find((category) => category.categoryName === 'eyeBlinkRight')?.score || 0;
        if (result.faceLandmarks?.[0]?.length) {
          if (leftBlink < 0.25 && rightBlink < 0.25) eyesWereOpen = true;
          if (eyesWereOpen && leftBlink > 0.45 && rightBlink > 0.45) {
            finish(null, true);
            return;
          }
        } else {
          eyesWereOpen = false;
        }
      }
      frameId = requestAnimationFrame(detect);
    };
    signal?.addEventListener('abort', handleAbort, { once: true });
    frameId = requestAnimationFrame(detect);
  });
}
