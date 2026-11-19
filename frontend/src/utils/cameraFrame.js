export function captureCompressedFrame(video, quality = 0.75) {
  if (!video || !video.videoWidth || !video.videoHeight) {
    throw new Error('Camera preview is not ready.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 640;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Could not prepare the camera frame.');
  const sourceRatio = video.videoWidth / video.videoHeight;
  const targetRatio = 480 / 640;
  let sx = 0;
  let sy = 0;
  let sw = video.videoWidth;
  let sh = video.videoHeight;
  if (sourceRatio > targetRatio) {
    sw = video.videoHeight * targetRatio;
    sx = (video.videoWidth - sw) / 2;
  } else {
    sh = video.videoWidth / targetRatio;
    sy = (video.videoHeight - sh) / 2;
  }
  context.fillStyle = '#fff';
  context.fillRect(0, 0, 480, 640);
  context.drawImage(video, sx, sy, sw, sh, 0, 0, 480, 640);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const sizeEstimate = Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
  if (sizeEstimate > 70 * 1024) {
    const lowerQualityUrl = canvas.toDataURL('image/jpeg', 0.6);
    return lowerQualityUrl;
  }
  return dataUrl;
}
