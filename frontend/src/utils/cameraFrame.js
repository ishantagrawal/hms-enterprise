const MAX_FRAME_BYTES = 70 * 1024;

function canvasBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not compress the camera frame.'));
    }, 'image/jpeg', quality);
  });
}

export async function compressCameraFrame(video) {
  if (!video?.videoWidth || !video?.videoHeight) {
    throw new Error('The camera is not ready yet.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 640;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the camera frame.');

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  let blob;
  for (let quality = 0.75; quality >= 0.45; quality -= 0.05) {
    blob = await canvasBlob(canvas, quality);
    if (blob.size < MAX_FRAME_BYTES) break;
  }
  canvas.width = 0;
  canvas.height = 0;
  if (!blob || blob.size >= MAX_FRAME_BYTES) {
    throw new Error('The camera frame could not be compressed below 70 KB.');
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}