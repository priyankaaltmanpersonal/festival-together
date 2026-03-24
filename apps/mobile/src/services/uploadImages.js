import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Open the system photo picker and return an array of local image URIs.
 * Returns null if the user cancels or permission is denied.
 * Throws Error('permission_denied') if the user explicitly denies permission.
 */
export async function pickImages() {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('permission_denied');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    quality: 1,
    selectionLimit: 30,
  });

  if (result.canceled) return null;
  return result.assets.map((a) => a.uri);
}

/**
 * Compress a single image URI: resize to max 1500px longest side, JPEG 85%.
 * Returns the compressed local URI.
 */
async function compressImage(uri) {
  const manipResult = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1500 } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
  );
  return manipResult.uri;
}

/**
 * Compress and upload an array of image URIs to the given API endpoint.
 *
 * @param {string} apiUrl        - Base URL, e.g. https://festival-together-api.onrender.com
 * @param {string} endpoint      - Path, e.g. /v1/groups/abc/canonical/upload
 * @param {string} sessionToken  - Member session token for x-session-token header
 * @param {string[]} imageUris   - Local file URIs from pickImages()
 * @param {function} [onProgress]- Called with (completedCount, totalCount) as each image is compressed
 * @returns {Promise<{parsed_count, failed_count, parse_job_id, unresolved_count?, ok}>}
 */
export async function uploadImages(apiUrl, endpoint, sessionToken, imageUris, onProgress) {
  const formData = new FormData();

  for (let i = 0; i < imageUris.length; i++) {
    const compressedUri = await compressImage(imageUris[i]);
    formData.append('images', {
      uri: compressedUri,
      name: `image_${i}.jpg`,
      type: 'image/jpeg',
    });
    if (onProgress) onProgress(i + 1, imageUris.length);
  }

  const response = await fetch(`${apiUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'x-session-token': sessionToken,
      // Do NOT set Content-Type manually — fetch sets it with the correct multipart boundary
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `upload_failed_${response.status}`);
  }

  return response.json();
}
