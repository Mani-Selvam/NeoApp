import { API_URL } from "../services/apiConfig";

/**
 * Get the full URL for an image
 * @param {string} imagePath - The image path from the database (can be a URI, base64, or server path)
 * @returns {string} - Full image URL or the original path if it's already a full URI/base64
 */
export const getImageUrl = (imagePath) => {
    if (!imagePath) return null;

    // If it's base64 data, return as is
    if (imagePath.startsWith("data:image")) {
        return imagePath;
    }

    // If it's already a full URI (http/https) or file URI, return as is
    if (
        imagePath.startsWith("http://") ||
        imagePath.startsWith("https://") ||
        imagePath.startsWith("file://") ||
        imagePath.startsWith("content://")
    ) {
        return imagePath;
    }

    // If it's a server path like "/uploads/...", construct full URL
    if (imagePath.startsWith("/uploads/")) {
        const baseUrl = API_URL.replace("/api", "");
        return `${baseUrl}${imagePath}`;
    }

    // Default: return as is
    return imagePath;
};
