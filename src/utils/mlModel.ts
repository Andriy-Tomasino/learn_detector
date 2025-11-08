// Roboflow Serverless API configuration
const SERVERLESS_API_URL = 'https://serverless.roboflow.com/drones-vofcv/3';
const API_KEY = 'unauthorized'; // Replace with your Roboflow API key

// Check if API is available (no health check needed for serverless API)
export const loadDroneModel = async (): Promise<void> => {
  try {
    console.log('Using Roboflow Serverless API');
    // Serverless API doesn't need a health check
    return;
  } catch (error) {
    console.error('Error initializing model:', error);
    throw error;
  }
};

// Detect drones in an image/video frame using Roboflow Serverless API
export const detectDrones = async (canvas: HTMLCanvasElement): Promise<any[]> => {
  try {
    // Convert canvas to base64 image (full data URL)
    const imageBase64 = canvas.toDataURL('image/jpeg', 0.9);

    // Build URL with API key as query parameter
    const url = `${SERVERLESS_API_URL}?api_key=${API_KEY}`;

    // Call Roboflow Serverless API using fetch
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: imageBase64
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', response.status, errorText);
      return [];
    }

    const result = await response.json();

    // Process Roboflow API response
    return processRoboflowResponse(result, canvas.width, canvas.height);
  } catch (error: any) {
    console.error('Error during detection:', error);
    if (error.message) {
      console.error('Error Message:', error.message);
    }
    return [];
  }
};

// Process Roboflow API response into our detection format
const processRoboflowResponse = (
  response: any,
  imageWidth: number,
  imageHeight: number
): any[] => {
  const detections: any[] = [];

  // Roboflow API returns predictions in response.predictions array
  if (response.predictions && Array.isArray(response.predictions)) {
    response.predictions.forEach((prediction: any) => {
      // Roboflow returns bbox as {x, y, width, height} or {x_min, y_min, x_max, y_max}
      let x: number, y: number, width: number, height: number;

      if (prediction.x && prediction.y && prediction.width && prediction.height) {
        // Format: {x, y, width, height} (center coordinates)
        x = prediction.x - prediction.width / 2;
        y = prediction.y - prediction.height / 2;
        width = prediction.width;
        height = prediction.height;
      } else if (prediction.x_min !== undefined && prediction.y_min !== undefined) {
        // Format: {x_min, y_min, x_max, y_max}
        x = prediction.x_min;
        y = prediction.y_min;
        width = prediction.x_max - prediction.x_min;
        height = prediction.y_max - prediction.y_min;
      } else {
        // Try to extract from bbox array if available
        const bbox = prediction.bbox || prediction.box || [];
        if (bbox.length >= 4) {
          x = bbox[0];
          y = bbox[1];
          width = bbox[2] - bbox[0];
          height = bbox[3] - bbox[1];
        } else {
          return; // Skip invalid prediction
        }
      }

      // Ensure coordinates are within canvas bounds
      x = Math.max(0, Math.min(x, imageWidth));
      y = Math.max(0, Math.min(y, imageHeight));
      width = Math.max(0, Math.min(width, imageWidth - x));
      height = Math.max(0, Math.min(height, imageHeight - y));

      detections.push({
        bbox: [x, y, width, height],
        confidence: prediction.confidence || 0.5,
        class: prediction.class || 'drone',
      });
    });
  }

  return detections;
};

