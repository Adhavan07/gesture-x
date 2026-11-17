import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

let landmarkerInstance: HandLandmarker | null = null;
let loadingPromise: Promise<HandLandmarker> | null = null;

export async function getHandLandmarker(): Promise<HandLandmarker> {
  if (landmarkerInstance) {
    return landmarkerInstance;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks('/mediapipe-wasm');

    try {
      const instance = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/models/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.7,
        minHandPresenceConfidence: 0.7,
        minTrackingConfidence: 0.6,
      });
      landmarkerInstance = instance;
      return instance;
    } catch {
      // Fallback to CPU delegate if WebGL/GPU delegate is unavailable
      const instance = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/models/hand_landmarker.task',
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.7,
        minHandPresenceConfidence: 0.7,
        minTrackingConfidence: 0.6,
      });
      landmarkerInstance = instance;
      return instance;
    }
  })();

  try {
    return await loadingPromise;
  } catch (err) {
    loadingPromise = null;
    throw err;
  }
}

export function disposeHandLandmarker(): void {
  if (landmarkerInstance) {
    try {
      landmarkerInstance.close();
    } catch {
      // Ignore close error
    }
    landmarkerInstance = null;
  }
  loadingPromise = null;
}
