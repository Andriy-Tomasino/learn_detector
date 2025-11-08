// API configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Fetch video from backend
export const fetchVideo = async (videoId: string): Promise<Blob> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/videos/${videoId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.statusText}`);
    }

    return await response.blob();
  } catch (error) {
    console.error('Error fetching video:', error);
    throw error;
  }
};

// Fetch JSON detections from backend
export const fetchDetections = async (videoId: string): Promise<any> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/detections/${videoId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch detections: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching detections:', error);
    throw error;
  }
};

// Alternative: Fetch video and detections together
export const fetchVideoWithDetections = async (videoId: string): Promise<{
  video: Blob;
  detections: any;
}> => {
  try {
    const [video, detections] = await Promise.all([
      fetchVideo(videoId),
      fetchDetections(videoId),
    ]);

    return { video, detections };
  } catch (error) {
    console.error('Error fetching video with detections:', error);
    throw error;
  }
};

// Generic API fetch function
export const apiFetch = async (
  endpoint: string,
  options?: RequestInit
): Promise<any> => {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }

    return await response.blob();
  } catch (error) {
    console.error('API fetch error:', error);
    throw error;
  }
};

