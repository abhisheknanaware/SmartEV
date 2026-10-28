import { uploadApi } from './api';

/**
 * Uploads a station photo and resolves to { secure_url }.
 * Uses Cloudinary with a backend-issued signature (the API secret stays on the server); when the
 * server has no Cloudinary keys, the image is stored by the backend itself.
 * @param {File} file - Image file chosen by the admin
 */
export async function uploadToCloudinary(file) {
  let sig;
  try {
    sig = (await uploadApi.getSignature()).data;
  } catch (err) {
    if (err.response?.status !== 503) {
      throw new Error(err.response?.data?.message || 'Could not authorise the upload. Please try again.');
    }
    try {
      const { data } = await uploadApi.uploadImage(file);
      return { url: data.url, secure_url: data.url };
    } catch (e) {
      throw new Error(e.response?.data?.message || 'The image could not be uploaded. Please try again.');
    }
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', sig.apiKey);
  formData.append('timestamp', sig.timestamp);
  formData.append('folder', sig.folder);
  formData.append('signature', sig.signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: 'POST', body: formData });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Cloudinary upload failed with status ${response.status}`);
  }
  const result = await response.json();
  return { url: result.url, secure_url: result.secure_url, public_id: result.public_id };
}
